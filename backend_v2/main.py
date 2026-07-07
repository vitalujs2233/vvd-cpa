from fastapi import FastAPI

app = FastAPI(
    title="VVD CPA API V2",
    version="2.0"
)


@app.get("/")
async def root():
    return {
        "message": "Backend V2 работает"
    }


@app.get("/health")
async def health():
    return {
        "status": "ok"
    }
