"""
ShoeScout — TabPFN Forecast Micro-service
------------------------------------------
Receives price-history features, returns a 7-day price direction forecast.
TabPFN is a small pre-trained transformer for tabular data — no fine-tuning needed.
"""

from __future__ import annotations

import logging
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator

logger = logging.getLogger("tabpfn-svc")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ShoeScout TabPFN Service", version="0.1.0")


# ── Request / Response schemas ────────────────────────────────────────────────

class PriceRecord(BaseModel):
    date: str        # ISO date string e.g. "2026-09-30"
    price: float
    platform: str


class ForecastRequest(BaseModel):
    product_id: int
    platform: str
    history: list[PriceRecord]

    @field_validator("history")
    @classmethod
    def enough_history(cls, v: list[PriceRecord]) -> list[PriceRecord]:
        if len(v) < 7:
            raise ValueError("Need at least 7 price records to forecast")
        return v


class ForecastResponse(BaseModel):
    product_id: int
    platform: str
    recommendation: Literal["buy_now", "wait"]
    predicted_price_7d: float
    confidence: float           # 0–1 (TabPFN probability of the predicted class)
    current_vs_30d_avg: float   # % difference
    baseline_7d_ma: float       # 7-day moving average (simple baseline for comparison)
    reasoning_inputs: dict      # raw features passed to model (transparency)
    caveats: list[str]


# ── Feature engineering ───────────────────────────────────────────────────────

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values("date").copy()
    df["price_lag1"]   = df["price"].shift(1)
    df["price_lag3"]   = df["price"].shift(3)
    df["price_lag7"]   = df["price"].shift(7)
    df["rolling_mean7"] = df["price"].rolling(7).mean()
    df["rolling_min7"]  = df["price"].rolling(7).min()
    df["rolling_std7"]  = df["price"].rolling(7).std()
    df["day_of_week"]  = pd.to_datetime(df["date"]).dt.dayofweek
    df["days_since_last_drop"] = (
        (df["price"] >= df["price"].shift(1))
        .cumsum()
        .sub(
            (df["price"] >= df["price"].shift(1))
            .cumsum()
            .where(df["price"] < df["price"].shift(1))
            .ffill()
            .fillna(0)
        )
    )
    return df.dropna()


# ── Forecast endpoint ─────────────────────────────────────────────────────────

@app.post("/forecast", response_model=ForecastResponse)
async def forecast(req: ForecastRequest) -> ForecastResponse:
    df = pd.DataFrame([r.model_dump() for r in req.history])
    df["date"] = pd.to_datetime(df["date"])

    featurised = build_features(df)

    if len(featurised) < 5:
        raise HTTPException(
            status_code=422,
            detail="Not enough non-null feature rows after engineering. "
                   "Provide at least 14 days of history for reliable results.",
        )

    feature_cols = [
        "price_lag1", "price_lag3", "price_lag7",
        "rolling_mean7", "rolling_min7", "rolling_std7",
        "day_of_week", "days_since_last_drop",
    ]

    X = featurised[feature_cols].values
    y_prices = featurised["price"].values

    # Label: 1 = price went DOWN in the next 7 days (buy_now signal)
    current_price = float(df["price"].iloc[-1])
    rolling_mean  = float(featurised["rolling_mean7"].iloc[-1])
    baseline_7d   = float(featurised["rolling_mean7"].iloc[-1])

    # Binary labels for training: did price drop in the following row?
    y = (featurised["price"].shift(-1) < featurised["price"]).astype(int).values[:-1]
    X_train = X[:-1]
    X_test  = X[-1:].reshape(1, -1)

    if len(np.unique(y)) < 2:
        # Edge case: all labels the same — fall back to baseline
        direction = "wait"
        confidence = 0.5
        predicted_price = baseline_7d
    else:
        try:
            from tabpfn import TabPFNClassifier  # lazy import — optional dependency
            clf = TabPFNClassifier(device="cpu", N_ensemble_configurations=8)
            clf.fit(X_train, y)
            proba = clf.predict_proba(X_test)[0]
            drop_prob = float(proba[1])          # probability price will drop
            direction = "buy_now" if drop_prob >= 0.5 else "wait"
            confidence = round(max(drop_prob, 1 - drop_prob), 3)
            predicted_price = round(
                current_price * (0.97 if direction == "buy_now" else 1.01), 2
            )
        except ImportError:
            logger.warning("TabPFN not installed — returning moving-average baseline")
            direction = "buy_now" if current_price < rolling_mean else "wait"
            confidence = 0.5
            predicted_price = baseline_7d

    avg_30d = float(df["price"].tail(30).mean())
    pct_vs_avg = round((current_price - avg_30d) / avg_30d * 100, 2)

    last_features = {col: float(featurised[col].iloc[-1]) for col in feature_cols}

    caveats = [
        "Based on synthetic demo data — treat as illustrative only.",
        "Small history window reduces forecast reliability.",
        "TabPFN is a zero-shot tabular model; accuracy improves with more history.",
    ]
    if len(req.history) < 30:
        caveats.append(f"Only {len(req.history)} days of history; 30+ recommended.")

    return ForecastResponse(
        product_id=req.product_id,
        platform=req.platform,
        recommendation=direction,
        predicted_price_7d=predicted_price,
        confidence=confidence,
        current_vs_30d_avg=pct_vs_avg,
        baseline_7d_ma=round(baseline_7d, 2),
        reasoning_inputs=last_features,
        caveats=caveats,
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "tabpfn-svc"}
