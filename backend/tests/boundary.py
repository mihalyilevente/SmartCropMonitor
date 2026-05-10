import xarray as xr
import geopandas as gpd
import matplotlib.pyplot as plt
from shapely.geometry import shape

ds = xr.open_dataset(
    r"C:\Users\nikit\PycharmProjects\SmartCropMonitor\backend\data\storage\ndvi\metrics_user_1_loc_1_20260503T095740.nc"
)
band = ds["ndvi"]

geojson_geometry = {
    "type": "MultiPolygon",
    "coordinates": [[[[19.638085, 47.728511],
          [19.640167, 47.729888],
          [19.643165, 47.732705],
          [19.642286, 47.733369],
          [19.644645, 47.735940],
          [19.654341, 47.729301],
          [19.654280, 47.728448],
          [19.658303, 47.726320],
          [19.649874, 47.720580],
          [19.638085, 47.728511]]]]
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

