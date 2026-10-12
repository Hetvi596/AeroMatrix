# Deploying AeroMatrix on Vercel

Vercel hosts the web app. The three Python services are too large for Vercel functions
(about 420–470 MB each with their libraries), so they run as Docker Spaces on Hugging Face
(see `deploy/huggingface/`). Without them the app still works; the screens that need them
say the service isn't connected.

## What is in the repository

| File | Purpose |
|---|---|
| `vercel.json` | Builds only the web app: Vite, `npm install`, `npm run build`, output `dist` |
| `.vercelignore` | Leaves out the backends, landing page and raw data |
| `scripts/copy-cesium.mjs` | Runs before the build and copies the Cesium map assets |
| `deploy/huggingface/*` | Dockerfile and Space settings for each Python service |

## Import on Vercel

1. **Add New → Project**, import `Hetvi596/AeroMatrix`. If Vercel shows several
   applications, choose **Import single project** for `app` (root `./`). Branch: `final`
   (make it the GitHub default branch, or set it later under Settings → Git → Production Branch).
2. Framework preset: **Vite** (read from `vercel.json`). Leave the build settings as they are.
3. Environment variables (Production), with your Hugging Face username:

   | Name | Value | Needed for |
   |---|---|---|
   | `VITE_AEROMATRIX_API_URL` | `https://<username>-aeromatrix-model.hf.space` | Station forecasts, Air Quality drawer |
   | `VITE_TASK2_API_URL` | `https://<username>-aeromatrix-sensors.hf.space` | Sensor Intelligence |
   | `VITE_CHATBOT_API_URL` | `https://<username>-aerosage.hf.space` | AeroSage assistant |
   | `VITE_LANDING_URL` | your landing page address (optional) | "Back to site" button |
   | `VITE_CESIUM_ION_TOKEN` | free token from ion.cesium.com (optional) | Photorealistic 3D city |

   These are read at build time: after changing one, redeploy.
4. **Deploy**.

## Connect the services

On each Hugging Face Space set the allowed origin to your Vercel address
(for example `https://aeromatrix.vercel.app`):

| Space | Variable |
|---|---|
| `aeromatrix-model` | `AEROMATRIX_CORS_ORIGINS` |
| `aeromatrix-sensors` | `TASK2_CORS_ORIGINS` |
| `aerosage` | `CHATBOT_CORS_ORIGINS`, plus `AEROMATRIX_ML_API_URL` = the model Space address, and the secret `GEMINI_API_KEY` |

## Works without any backend

Overview, Zones, Industries, Actions, What-If, Sites, Plan-It and its PDF run in the browser,
with current air quality from Open-Meteo. Station forecasts, Sensor Intelligence and AeroSage
need their services.
