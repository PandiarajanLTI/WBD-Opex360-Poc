from fastapi.testclient import TestClient

from app.api.dependencies import get_repository
from app.main import app


class ExportRepositoryStub:
    def __init__(self):
        self.request = None

    def query(self, template_name, request):
        assert template_name == "Warner Media"
        self.request = request
        return ([{"UNIQ_ID": 4, "COMPANY_CODE": "US01"}], 275)


def test_export_passes_pagination_filters_and_sort_to_grid_query():
    repository = ExportRepositoryStub()
    app.dependency_overrides[get_repository] = lambda: repository
    try:
        response = TestClient(app).post(
            "/api/templates/Warner%20Media/export",
            json={
                "startRow": 200,
                "endRow": 400,
                "sortModel": [{"colId": "NOV_FORECAST", "sort": "desc"}],
                "filterModel": {
                    "COMPANY_CODE": {
                        "filterType": "text",
                        "type": "equals",
                        "filter": "US01",
                    }
                },
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["x-total-row-count"] == "275"
    assert response.text.splitlines() == [
        "UNIQ_ID,COMPANY_CODE",
        "4,US01",
    ]
    assert repository.request.startRow == 200
    assert repository.request.endRow == 400
    assert repository.request.sortModel[0].colId == "NOV_FORECAST"
    assert repository.request.filterModel["COMPANY_CODE"]["filter"] == "US01"
