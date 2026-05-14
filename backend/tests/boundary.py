import xarray as xr
import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.geometry import shape

ds = xr.open_dataset(
    r"C:\Users\nikit\PycharmProjects\SmartCropMonitor\backend\data\storage\ndvi\metrics_user_1_loc_2_20260510T094721.nc"
)
band = ds["ndvi"]

geojson_geometry = {
    "type": "MultiPolygon",
    "coordinates": [
        [
            [
                [21.252509, 48.194911],
                [21.252508, 48.194641],
                [21.252777, 48.194641],
                [21.252779, 48.194911],
                [21.252509, 48.194911]
            ]
        ]
    ]
}
gdf = gpd.GeoDataFrame({"id": [1]}, geometry=[shape(geojson_geometry)], crs="EPSG:4326")

target_crs = "EPSG:32634" 
gdf = gdf.to_crs(target_crs)

fig, ax = plt.subplots(figsize=(10, 8))

band.plot(ax=ax, x="x", y="y", cmap="RdYlGn", add_colorbar=True)

gdf.boundary.plot(
    ax=ax, 
    color="black", 
    linewidth=3,
    zorder=10
)

bounds = gdf.total_bounds
ax.set_xlim(bounds[0] - 50, bounds[2] + 50)
ax.set_ylim(bounds[1] - 50, bounds[3] + 50)

plt.title("Field Boundary Overlay (Projected)")
plt.show()

