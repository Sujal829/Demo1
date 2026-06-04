import os
import joblib
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class PredictionEngine:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.load_model()
        self.load_scaler()
        
    def load_model(self):
        model_path = os.getenv("MODEL_PATH", "/app/models/xgboost_nsei.joblib")
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                logger.info(f"Loaded ML model from {model_path}")
            except Exception as e:
                logger.error(f"Error loading model: {e}")
        else:
            logger.warning(f"Model not found at {model_path}. Predictions will be unavailable.")

    def load_scaler(self):
        scaler_path = os.getenv("SCALER_PATH", "/app/models/scaler.joblib")
        if os.path.exists(scaler_path):
            try:
                self.scaler = joblib.load(scaler_path)
                logger.info(f"Loaded feature scaler from {scaler_path}")
            except Exception as e:
                logger.error(f"Error loading scaler: {e}")
        else:
            logger.warning(f"Scaler not found at {scaler_path}. Predictions may be unscaled.")

    def get_prediction(self, features: pd.DataFrame) -> dict:
        """
        Returns prediction probabilities based on features.
        """
        if self.model is None:
            return {"error": "Model not loaded"}
            
        try:
            # Scale features if scaler is loaded
            if self.scaler is not None:
                scaled_features = self.scaler.transform(features)
                # Keep feature names for XGBoost
                features_scaled_df = pd.DataFrame(scaled_features, columns=features.columns)
            else:
                features_scaled_df = features

            # Predict probabilities
            proba = self.model.predict_proba(features_scaled_df)
            
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
            logger.error(f"Prediction error: {e}")
            return {"error": str(e)}

prediction_engine = PredictionEngine()
