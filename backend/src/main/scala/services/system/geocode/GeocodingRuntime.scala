package services.system.geocode

import java.time.Instant

import cats.effect.{IO, Ref}
import cats.effect.std.Mutex
import cats.syntax.all.*
import scala.concurrent.duration.*

import services.system.api.{ApiError, ApiException}
import services.system.config.{GeocodingConfig, GeocodingMode}
import services.system.geocode.fake.FakeGeocoding
import services.system.geocode.nominatim.NominatimGeocoding
import services.system.geocode.objects.GeocodedPlace
import services.system.geocode.ports.Geocoding

/** 地点搜索端口的运行时持有者：启动时装配可替换实现，并提供全应用 ≤1 次/秒限流与重复查询缓存。
  *
  * plan(connection) 拿不到端口参数（规则 27），因此沿用 AiRuntime 的装配方式；未初始化是明确启动错误。
  */
object GeocodingRuntime:
  private final case class CachedPlaces(places: List[GeocodedPlace], sequence: Long)

  private final case class State(
    provider: Geocoding,
    cache: Ref[IO, Map[String, CachedPlaces]],
    lastCallAt: Ref[IO, Option[Instant]],
    sequence: Ref[IO, Long],
    mutex: Mutex[IO],
    minInterval: FiniteDuration,
    cacheSize: Int
  )

  private val stateRef: Ref[IO, Option[State]] = Ref.unsafe[IO, Option[State]](None)

  /** 按配置装配 fake/live 实现并清空缓存与限流状态。 */
  def initialize(config: GeocodingConfig): IO[Unit] =
    for
      provider <- providerFromConfig(config)
      cache <- Ref.of[IO, Map[String, CachedPlaces]](Map.empty)
      lastCallAt <- Ref.of[IO, Option[Instant]](None)
      sequence <- Ref.of[IO, Long](0L)
      mutex <- Mutex[IO]
      _ <- stateRef.set(Some(State(provider, cache, lastCallAt, sequence, mutex, config.minInterval, config.cacheSize)))
    yield ()

  /** 搜索地点；相同 query（去首尾空白、忽略大小写）命中缓存，未命中时受限流约束调用提供方。 */
  def search(query: String): IO[List[GeocodedPlace]] =
    state.flatMap(current => searchWith(current, query))

  def isInitialized: IO[Boolean] = stateRef.get.map(_.isDefined)

  private def state: IO[State] =
    stateRef.get.flatMap {
      case Some(current) => IO.pure(current)
      case None =>
        IO.raiseError(
          ApiException(ApiError.internal("地理编码端口尚未初始化：启动时必须调用 GeocodingRuntime.initialize(config.geocoding)"))
        )
    }

  private def providerFromConfig(config: GeocodingConfig): IO[Geocoding] =
    config.mode match
      case GeocodingMode.Fake => IO.pure(FakeGeocoding())
      case GeocodingMode.Live =>
        IO.pure(NominatimGeocoding(config.baseUrl, config.userAgent, config.timeout.toMillis))

  private def searchWith(current: State, query: String): IO[List[GeocodedPlace]] =
    val key = query.trim.toLowerCase
    current.cache.get.flatMap { cache =>
      cache.get(key) match
        case Some(cached) => IO.pure(cached.places)
        case None =>
          current.mutex.lock.use { _ =>
            current.cache.get.flatMap { rechecked =>
              rechecked.get(key) match
                case Some(cached) => IO.pure(cached.places)
                case None =>
                  for
                    _ <- awaitSlot(current)
                    places <- current.provider.search(query)
                    _ <- store(current, key, places)
                  yield places
            }
          }
    }

  /** 全应用合计 ≤1 次/秒：在互斥锁内等待到上次调用后的最小间隔。 */
  private def awaitSlot(current: State): IO[Unit] =
    for
      now <- IO.realTimeInstant
      last <- current.lastCallAt.get
      delayMillis = last
                      .map(previous => previous.plusMillis(current.minInterval.toMillis).toEpochMilli - now.toEpochMilli)
                      .map(math.max(0L, _))
                      .getOrElse(0L)
      _ <- IO.sleep(delayMillis.millis)
      slot <- IO.realTimeInstant
      _ <- current.lastCallAt.set(Some(slot))
    yield ()

  private def store(current: State, key: String, places: List[GeocodedPlace]): IO[Unit] =
    for
      sequence <- current.sequence.updateAndGet(_ + 1)
      _ <- current.cache.update { existing =>
             val updated = existing.updated(key, CachedPlaces(places, sequence))
             if updated.size <= current.cacheSize then updated
             else updated.removed(updated.minBy(_._2.sequence)._1)
           }
    yield ()
