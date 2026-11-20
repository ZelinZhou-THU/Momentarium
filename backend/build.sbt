ThisBuild / scalaVersion := "3.3.4"
ThisBuild / organization := "momentarium"
ThisBuild / version := "0.1.0"

lazy val root = (project in file("."))
  .settings(
    name := "momentarium-platform",
    Compile / mainClass := Some("services.system.startup.Main"),
    run / fork := true,
    Test / parallelExecution := false,
    scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked"),
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "org.http4s" %% "http4s-ember-server" % "0.23.30",
      "org.http4s" %% "http4s-dsl" % "0.23.30",
      "org.http4s" %% "http4s-circe" % "0.23.30",
      "io.circe" %% "circe-core" % "0.14.10",
      "io.circe" %% "circe-generic" % "0.14.10",
      "io.circe" %% "circe-parser" % "0.14.10",
      "com.zaxxer" % "HikariCP" % "5.1.0",
      "org.postgresql" % "postgresql" % "42.7.5",
      "ch.qos.logback" % "logback-classic" % "1.5.12",
      "org.mindrot" % "jbcrypt" % "0.4",
      "com.twelvemonkeys.imageio" % "imageio-webp" % "3.15.3",
      "org.scalameta" %% "munit" % "1.0.3" % Test,
      "org.typelevel" %% "munit-cats-effect" % "2.0.0" % Test
    )
  )
