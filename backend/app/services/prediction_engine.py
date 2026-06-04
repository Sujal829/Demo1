import os
import joblib
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class PredictionEngine:
    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.fallback_model = None
        self.fallback_scaler = None
        self.timeframes = ["15m", "30m", "1h", "1d"]
        self.load_models()
        
    def load_models(self):
        # 1. Load timeframe-specific models and scalers
        for tf in self.timeframes:
            model_path = f"/app/models/ensemble_{tf}.joblib"
            scaler_path = f"/app/models/scaler_{tf}.joblib"
            
            # Host fallback path
            if not os.path.exists(model_path):
                model_path = f"models/ensemble_{tf}.joblib"
            if not os.path.exists(scaler_path):
                scaler_path = f"models/scaler_{tf}.joblib"
                
            if os.path.exists(model_path) and os.path.exists(scaler_path):
                try:
                    self.models[tf] = joblib.load(model_path)
                    self.scalers[tf] = joblib.load(scaler_path)
                    logger.info(f"Loaded ensemble model & scaler for timeframe: {tf}")
                except Exception as e:
                    logger.error(f"Error loading model/scaler for timeframe {tf}: {e}")
            else:
                logger.warning(f"Model/scaler not found for timeframe {tf} (paths: {model_path}, {scaler_path}).")
                
        # 2. Load fallback model/scaler
        fb_model_path = os.getenv("MODEL_PATH", "/app/models/xgboost_nsei.joblib")
        fb_scaler_path = os.getenv("SCALER_PATH", "/app/models/scaler.joblib")
        if not os.path.exists(fb_model_path):
            fb_model_path = "models/xgboost_nsei.joblib"
        if not os.path.exists(fb_scaler_path):
            fb_scaler_path = "models/scaler.joblib"
            
        if os.path.exists(fb_model_path):
            try:
                self.fallback_model = joblib.load(fb_model_path)
                logger.info(f"Loaded fallback model from {fb_model_path}")
            except Exception as e:
                logger.error(f"Error loading fallback model: {e}")
        if os.path.exists(fb_scaler_path):
            try:
                self.fallback_scaler = joblib.load(fb_scaler_path)
                logger.info(f"Loaded fallback scaler from {fb_scaler_path}")
            except Exception as e:
                logger.error(f"Error loading fallback scaler: {e}")

    def get_prediction(self, features: pd.DataFrame, timeframe: str = "15m") -> dict:
        """
        Returns prediction probabilities based on features, using the timeframe-specific ensemble model.
        """
        model = self.models.get(timeframe)
        scaler = self.scalers.get(timeframe)
        
        is_ensemble = True
        
        # Fallback if timeframe model is not loaded
        if model is None or scaler is None:
            logger.warning(f"Timeframe model/scaler not loaded for '{timeframe}'. Falling back to Nifty model.")
            model = self.fallback_model
            scaler = self.fallback_scaler
            is_ensemble = False
            
        if model is None:
            return {"error": f"No model loaded for timeframe '{timeframe}' or fallback."}
            
        try:
            # Scale features if scaler is loaded
            if scaler is not None:
                scaled_features = scaler.transform(features)
                # Keep feature names for XGBoost
                features_scaled_df = pd.DataFrame(scaled_features, columns=features.columns)
            else:
                features_scaled_df = features

            # Predict probabilities
            if is_ensemble:
                xgb_model = model.get("xgb")
                rf_model = model.get("rf")
                if xgb_model is None or rf_model is None:
                    raise ValueError("Ensemble components 'xgb' or 'rf' are missing.")
                xgb_proba = xgb_model.predict_proba(features_scaled_df)
                rf_proba = rf_model.predict_proba(features_scaled_df)
                proba = (xgb_proba + rf_proba) / 2.0
            else:
                proba = model.predict_proba(features_scaled_df)
            
            # Assuming index 1 is probability of UP
            up_prob = proba[0][1]
            down_prob = proba[0][0]
            
            direction = "CALL" if up_prob > 0.60 else "PUT" if down_prob > 0.60 else "NO TRADE"
            confidence = max(up_prob, down_prob) * 100
            
            return {
                "direction": direction,
                "confidence": round(confidence, 2),
                "up_probability": round(up_prob, 4),
                "down_probability": round(down_prob, 4)
            }
        except Exception as e:
            logger.error(f"Prediction error for timeframe {timeframe}: {e}")
            return {"error": str(e)}

prediction_engine = PredictionEngine()

