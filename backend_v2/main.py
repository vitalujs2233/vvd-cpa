from fastapi import FastAPI

app = FastAPI(
    title="VVD CPA Backend V2",
    version="2.0.0"
)

@app.get("/")
async def root():
    return {
        "message": "VVD CPA Backend V2 работает"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "2.0.0"
    }
