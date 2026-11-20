package services.system.startup

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.tables.{
  ChatMessageTableInitializer,
  ChatSessionTableInitializer,
  PhotoAnalysisTableInitializer,
  PhotoLocationCandidateTableInitializer
}
import services.gallery.tables.{
  ContributionInviteTableInitializer,
  ContributionTableInitializer,
  ExhibitionContributorTableInitializer,
  ExhibitionGroupTableInitializer,
  ExhibitionPhotoTableInitializer,
  ExhibitionTableInitializer,
  PhotoLocationTableInitializer,
  PhotoMemoryTableInitializer,
  PublicationTableInitializer
}
import services.scene.tables.SceneRunTableInitializer
import services.system.db.{Database, Transaction}
import services.users.tables.{ProfileTableInitializer, SessionTableInitializer, UserTableInitializer}

/** 启动时执行全部表初始化（CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS）。 */
object Initializers:
  private val all: List[Connection => IO[Unit]] =
    List(
      UserTableInitializer.initialize,
      SessionTableInitializer.initialize,
      ProfileTableInitializer.initialize,
      PhotoAnalysisTableInitializer.initialize,
      PhotoLocationCandidateTableInitializer.initialize,
      ChatSessionTableInitializer.initialize,
      ChatMessageTableInitializer.initialize,
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      ContributionInviteTableInitializer.initialize,
      ExhibitionContributorTableInitializer.initialize,
      ContributionTableInitializer.initialize,
      PhotoMemoryTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize
    )

  def run(database: Database): IO[Unit] =
    database.use(connection => Transaction(connection)(all.traverse_(initialize => initialize(connection))))
