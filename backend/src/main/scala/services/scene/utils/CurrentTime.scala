package services.scene.utils

import java.time.Instant

import cats.effect.IO

/** 服务内统一时间源：所有时间获取集中于此，经 IO 组合（rules 12：utils 服务内私有）。 */
private[scene] object CurrentTime:
  def now: IO[Instant] = IO.realTimeInstant
