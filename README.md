# CamRide (demo prototype)

Rides, moto-taxis (benskin) and food delivery for **all ten regions of Cameroon**, paid with **MTN Mobile Money**, **Orange Money** or cash. Bilingual (FR / EN), prices in FCFA (XAF).

**Live demo:** https://terencengoh.github.io/camride/

> Demo mode: payments are simulated and no real money moves. Drivers, restaurants and prices are fictional. Sign-ups, trips and orders are saved only in your browser (localStorage).

## Features
- Real map (Leaflet + OpenStreetMap) with browser geolocation for pickup. It falls back to Douala, or to the region you pick.
- Region selector: all 10 regional capitals (Adamawa, Centre, East, Far North, Littoral, North, Northwest, West, South, Southwest) plus Limbe, Kumba, Kribi, Dschang and Nkongsamba.
- Destination by tapping the map or by place search (Nominatim, explicit search, at most 1 request per second).
- Ride types:
  - CamRide Moto, CamRide Car and CamRide Comfort, with fares from distance and time. Routes come from the OSRM demo server, with a straight-line ×1.3 fallback.
  - Clear demo rate cards.
- Ride flow:
  - Request, then a simulated driver match (name, plate, rating, ETA).
  - The driver moves on the map to your pickup, then the trip runs.
  - Pay, then rate the driver.
- Food delivery:
  - 18 fictional restaurants across all regions, with regional dishes (ndolé, poulet DG, eru, achu, kilichi, okok, taro, koki and more).
  - Cart, delivery fee by distance, and live order tracking with a courier on the map.
- Checkout:
  - MTN MoMo or Orange Money with +237 number validation and operator detection.
  - A simulated "approve on your phone" prompt, then a receipt.
- Join form for riders, drivers, moto riders, couriers and restaurants, saved in localStorage.
- Operator dashboard built from the demo data in your browser.
- Installable PWA (manifest, icons, offline shell).

## Run locally
Any static server works, e.g. `python3 -m http.server`, then open http://localhost:8000.

## Going live
See [GO-LIVE.md](GO-LIVE.md) for company registration, transport and moto-taxi rules, real mobile money APIs and the native-app path, with sources.
