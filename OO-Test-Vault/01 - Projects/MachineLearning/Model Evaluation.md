# 📊 Model Evaluation

## Classification Metrics

### Accuracy
```
(TP + TN) / Total
```
Good for balanced classes.

### Precision
```
TP / (TP + FP)
```
When false positives are costly.

### Recall
```
TP / (TP + FN)
```
When false negatives are costly.

### F1 Score
```
2 * (Precision * Recall) / (Precision + Recall)
```
Balance of precision and recall.

## Regression Metrics

### MSE (Mean Squared Error)
```python
from sklearn.metrics import mean_squared_error
mse = mean_squared_error(y_true, y_pred)
```

### RMSE
```python
rmse = mean_squared_error(y_true, y_pred, squared=False)
```

### R² Score
```python
from sklearn.metrics import r2_score
r2 = r2_score(y_true, y_pred)
```

## Cross-Validation

```python
from sklearn.model_selection import cross_val_score

scores = cross_val_score(model, X, y, cv=5)
print(f"Mean: {scores.mean():.3f} (+/- {scores.std():.3f})")
```

## See Also

- [[Machine Learning Research]]
- [[Statistics Fundamentals]]
