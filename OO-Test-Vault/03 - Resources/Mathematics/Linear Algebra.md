# 📊 Linear Algebra

## Why It Matters

Foundation for:
- [[Machine Learning Research]]
- Computer graphics
- Signal processing
- Optimization

## Vectors

A vector is an ordered list of numbers.

```python
import numpy as np

v = np.array([1, 2, 3])

# Operations
v + w         # Addition
v * 2         # Scalar multiplication
np.dot(v, w)  # Dot product
np.linalg.norm(v)  # Magnitude
```

### Dot Product
$$\vec{a} \cdot \vec{b} = \sum_{i=1}^{n} a_i b_i$$

Measures similarity between vectors.

## Matrices

A 2D array of numbers.

```python
A = np.array([[1, 2], [3, 4]])

# Operations
A @ B         # Matrix multiplication
A.T           # Transpose
np.linalg.inv(A)  # Inverse
np.linalg.det(A)  # Determinant
```

## Key Concepts

### Eigenvalues & Eigenvectors
For matrix A:
$$A\vec{v} = \lambda\vec{v}$$

Where λ is eigenvalue, v is eigenvector.

```python
eigenvalues, eigenvectors = np.linalg.eig(A)
```

### Matrix Decomposition
- **SVD**: A = UΣV^T
- **PCA**: Dimensionality reduction
- **LU**: Lower-Upper decomposition

## Applications in ML

- Feature transformations
- [[Neural Networks Fundamentals]] (weight matrices)
- Principal Component Analysis

## See Also

- [[NumPy]]
- [[Mathematics for ML]]
- [[Calculus Basics]]
