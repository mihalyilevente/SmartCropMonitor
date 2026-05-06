from pystac_client import Client
import xarray as xr
import datetime

STAC_API_URL = "https://earth-search.aws.element84.com/v1"

def test_stac_channels(lat: float, lon: float):
    client = Client.open(STAC_API_URL)

    end_date = datetime.datetime.utcnow()
    start_date = end_date - datetime.timedelta(days=30)

    date_range = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    print(f"[DEBUG] Date range: {date_range}")
    print(f"[DEBUG] Location: lat={lat}, lon={lon}")

    search = client.search(
        collections=["sentinel-2-l2a"],
        bbox=[lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05],
        datetime=date_range,
        max_items=1,
        sortby=[{"field": "properties.datetime", "direction": "desc"}]
    )

    items = list(search.items())

    if not items:
        print("[ERROR] No items found")
        return

    item = items[0]

    print("\n[INFO] Item:")
    print(f"id: {item.id}")
    print(f"datetime: {item.datetime}")

    print("\n[INFO] Assets:")
    for key, asset in item.assets.items():
        print(f"\n--- {key} ---")
        print(f"href: {asset.href}")
        print(f"type: {asset.media_type}")
        print(f"roles: {asset.roles}")
        print(f"title: {asset.title}")


if __name__ == "__main__":
    test_stac_channels(lat=47.4979, lon=19.0402)
    ds = xr.open_dataset(r'C:\Users\nikit\PycharmProjects\SmartCropMonitor\backend\data\storage\data\user_1_loc_1_20260430T094748.nc')
    print(ds)
    print(ds.band.values)