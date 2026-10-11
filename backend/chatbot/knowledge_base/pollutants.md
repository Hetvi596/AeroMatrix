# Environmental concepts and pollutant definitions

PM2.5 means airborne particles with diameters generally 2.5 micrometers or smaller; PM10 includes particles generally 10 micrometers or smaller. They can be emitted directly or form from precursor gases. Sources include combustion, road/construction dust, and atmospheric reactions. Particle concentration is commonly reported as micrograms per cubic metre.

## Gaseous pollutants
NO2 (nitrogen dioxide) is associated with combustion, including traffic and industrial fuel burning. SO2 (sulfur dioxide) is associated with sulfur-containing fuels and industrial activity. CO (carbon monoxide) results from incomplete combustion. Ground-level O3 (ozone) forms through reactions involving nitrogen oxides and volatile organic compounds in sunlight; it is not simply emitted directly by a factory. NH3 is ammonia; NO is nitric oxide; NOx groups nitrogen oxides. Benzene, toluene and xylene are volatile organic compounds. Local causes require evidence; weather and transport also affect concentrations.

## AQI versus concentration
AQI is a dimensionless summary calculated using a defined jurisdiction's pollutant rules and averaging windows. It is not a concentration unit and cannot be read directly from one instantaneous pollutant value. AeroMatrix uses the Indian CPCB method in its documented backend. Do not apply US AQI thresholds to Indian data.

Sources: https://www.epa.gov/pm-pollution/particulate-matter-pm-basics ; https://www.epa.gov/ground-level-ozone-pollution/ground-level-ozone-basics ; https://www.epa.gov/criteria-air-pollutants ; AeroMatrix exported preprocessing/aqi.py for the implemented AQI behavior. These definitions do not establish current Pune measurements.
