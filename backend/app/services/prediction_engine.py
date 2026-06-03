import os
import joblib
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class PredictionEngine:
    def __init__(self):
        self.model = None
        self.load_model()
        
    def load_model(self):
        # We'll assume the model is copied to the backend or mounted via volume
        model_path = os.getenv("MODEL_PATH", "/app/models/xgboost_nsei.joblib")
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                logger.info(f"Loaded ML model from {model_path}")
            except Exception as e:
                logger.error(f"Error loading model: {e}")
        else:
            logger.warning(f"Model not found at {model_path}. Predictions will be unavailable.")

    def get_prediction(self, features: pd.DataFrame) -> dict:
        """
        Returns prediction probabilities based on features.
        """
        if self.model is None:
            return {"error": "Model not loaded"}
            
        try:
            # Predict probabilities
            proba = self.model.predict_proba(features)
            
            # Assuming index 1 is probability of UP
            up_prob = proba[0][1]
            down_prob = proba[0][0]
            
            direction = "CALL" if up_prob > 0.55 else "PUT" if down_prob > 0.55 else "NO TRADE"
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
