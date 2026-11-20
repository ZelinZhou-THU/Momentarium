package services.curation.utils

import services.curation.objects.LocationCandidate
import services.curation.objects.apiTypes.{PhotoLocationCandidateView, PhotoLocationCandidatesResponse}
import services.gallery.objects.PhotoId

/** 地点候选视图装配（纯函数）：响应中的 model/generatedAt 取当前候选集首条（同次建议写入）。 */
private[curation] object LocationCandidateViews:
  def view(candidate: LocationCandidate): PhotoLocationCandidateView =
    PhotoLocationCandidateView(
      id = candidate.id,
      name = candidate.name,
      latitude = candidate.latitude,
      longitude = candidate.longitude,
      granularity = candidate.granularity,
      reason = candidate.reason
    )

  def response(photoId: PhotoId, candidates: List[LocationCandidate]): PhotoLocationCandidatesResponse =
    PhotoLocationCandidatesResponse(
      photoId = photoId,
      candidates = candidates.map(view),
      model = candidates.headOption.map(_.model),
      generatedAt = candidates.headOption.map(_.generatedAt)
    )
