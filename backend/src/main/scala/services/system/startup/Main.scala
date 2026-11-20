package services.system.startup

import cats.effect.unsafe.implicits.global

object Main:
  def main(args: Array[String]): Unit =
    Startup.serve.unsafeRunSync()
