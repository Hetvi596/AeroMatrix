# AeroSage backend verification

Verified from an independently extracted package on Windows with Python 3.12.10. SETUP_CHATBOT.bat installed pinned dependencies into a fresh virtual environment. TEST_CHATBOT.bat passed 43 tests and launched a real HTTP service for smoke checks. One upstream test-client deprecation warning remains.

The independent chatbot was also connected to the existing exported trained ML service. All integration assertions passed: 18 recorded question/answer checks plus session follow-up assertions; the nineteenth report entry explicitly records live Gemini tests as NOT_RUN. Forecast and observation values match the actual ML API. Historical data remain labeled and withheld from current-data requests. The maximum recorded answer time in this run was 2.326 seconds; this is not Gemini latency or a performance guarantee.

See metadata/test_results.json for exact answers and metadata/service_test_results.json for standalone startup evidence. General Gemini answers, English/Hindi/Hinglish quality, and live provider latency are NOT_RUN because no key was supplied. Protocol mocks do not establish provider availability. This package requires a separately running ML API for numeric results. No original project imports or retraining were needed.

The package excludes secrets, runtime conversations, virtual environments and training datasets. Configure a Gemini key in the backend .env locally. This is a standalone integration handoff; mounting in the final application remains necessary.
