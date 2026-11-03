# GET /api/offline_snapshot: everything the app shows offline, in one answer (OfflineSnapshot).
#
# Conditional GET: the answer has an ETag. The browser sends it back in If-None-Match; when
# nothing changed since, the answer is 304 without a body and the browser keeps its copy.
# Like Flask's response.make_conditional or Spring's ShallowEtagHeaderFilter, but the ETag is
# worked out before the snapshot is built (OfflineSnapshot.version), so a 304 is cheap.
# The app version is part of it: a new deploy may send a different shape.
class Api::OfflineSnapshotsController < ApplicationController
  # stale? sets the ETag and, when it matches If-None-Match, answers 304 itself.
  def show
    render json: OfflineSnapshot.to_h if stale?(etag: [ AppVersion.current, OfflineSnapshot.version ])
  end
end
