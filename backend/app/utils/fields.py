from shapely.validation import explain_validity
from shapely.geometry import MultiPolygon, Polygon
from shapely import wkb
from pyproj import Geod


def validate_field_shape(field_shape):

    if field_shape is None:
        return {
            "valid": False,
            "error": "Geometry is missing"
        }

    try:
        if not isinstance(field_shape, (Polygon, MultiPolygon)):
            geometry = wkb.loads(bytes(field_shape.data))
        else:
            geometry = field_shape

    except Exception as e:
        return {
            "valid": False,
            "error": f"Failed to parse geometry: {str(e)}"
        }

    if not isinstance(geometry, MultiPolygon):
        return {
            "valid": False,
            "error": "Geometry must be MULTIPOLYGON"
        }

    if not geometry.is_valid:
        return {
            "valid": False,
            "error": explain_validity(geometry)
        }

    if geometry.is_empty:
        return {
            "valid": False,
            "error": "Geometry is empty"
        }

    if len(geometry.geoms) == 0:
        return {
            "valid": False,
            "error": "No polygons found"
        }

    area_ha = calculate_field_area(geometry)

    if area_ha < 0.01:
        return {
            "valid": False,
            "error": "Field area too small"
        }

    if area_ha > 100000:
        return {
            "valid": False,
            "error": "Field area unrealistically large"
        }

    return {
        "valid": True,
        "area_ha": round(area_ha, 2)
    }


def calculate_field_area(field_shape):

    if not isinstance(field_shape, (Polygon, MultiPolygon)):
        geometry = wkb.loads(bytes(field_shape.data))
    else:
        geometry = field_shape

    geod = Geod(ellps="WGS84")

    total_area_m2 = 0

    for polygon in geometry.geoms:
        lon, lat = polygon.exterior.coords.xy

        area, _ = geod.polygon_area_perimeter(lon, lat)

        total_area_m2 += abs(area)

    area_ha = total_area_m2 / 10_000

    return area_ha