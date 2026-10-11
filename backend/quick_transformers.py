"""Stable, importable, inference-time feature transformations for Quick CAD.
Keep this module available when loading quick_cad_model.joblib.
"""
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

INTERACTIONS = [
    ('Age', 'HTN'),
    ('DM', 'HTN'),
    ('Age', 'Typical Chest Pain'),
    ('BMI', 'DM'),
]

class Interactions(BaseEstimator, TransformerMixin):
    """Derive interaction terms without asking patients for more inputs."""
    def __init__(self, features, enabled=False):
        self.features = tuple(features)
        self.enabled = enabled

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X = np.asarray(X, dtype=object)
        if not self.enabled:
            return X
        added = []
        for a, b in INTERACTIONS:
            if a in self.features and b in self.features:
                aa = np.asarray(X[:, self.features.index(a)], dtype=float)
                bb = np.asarray(X[:, self.features.index(b)], dtype=float)
                added.append(aa * bb)
        return np.column_stack([X] + added) if added else X
