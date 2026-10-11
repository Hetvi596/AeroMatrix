# Monitoring stations and unsupported localities

The exported concentration backend supports these 12 monitoring locations: Karve Road, Mhada Colony, Alandi, Bhosari, Hadapsar, Transport Nagar-Nigdi, Revenue Colony-Shivajinagar, Katraj Dairy, Savitribai Phule Pune University, Bhumkar Nagar, Panchawati Pashan, Dhankawadi. These are station-specific records, not whole-locality averages. The names identify the source monitoring locations; verified coordinates were not supplied.

## Kothrud, Baner and unseen regions
Kothrud has older source-reported AQI in the separate historical archive, but no concentration model in this export. It must not be substituted with Karve Road or a nearby station. Baner does not have a matching supported station in this backend. Unknown or ambiguous station requests return UNAVAILABLE. A ward may have a polygon without a usable concentration forecast. No nearest-station substitution or unmonitored spatial prediction is validated.

## Sensor failure and missing measurements
The station forecast requires observed target history, including a valid latest target measurement and at least 16 observed hours in the trailing 24 hours. It uses previous observations and available observed weather. Feature imputation does not create a missing target history. If a sensor stops and sufficient recent history is no longer available, forecasting is unavailable. The system cannot claim continuous sensor-loss replacement or unseen-location inference. A separately validated spatial model and verified coordinates would be required for that capability.
