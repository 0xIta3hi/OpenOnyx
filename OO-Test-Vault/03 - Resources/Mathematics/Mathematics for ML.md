# 🧮 Mathematics for ML

## Core Areas

### 1. Linear Algebra
See [[Linear Algebra]] for details.

Key concepts:
- Vectors and matrices
- Matrix operations
- Eigenvalues/eigenvectors
- SVD decomposition

### 2. Calculus
See [[Calculus Basics]] for details.

Key concepts:
- Derivatives (gradients)
- Partial derivatives
- Chain rule (for backpropagation)
- Optimization

### 3. Probability & Statistics
See [[Statistics Fundamentals]] and [[Probability Theory]].

Key concepts:
- Probability distributions
- Bayes' theorem
- Expected value
- Maximum likelihood

### 4. Optimization

Gradient Descent:
$$\theta_{new} = \theta_{old} - \alpha \nabla L(\theta)$$

Where α is learning rate, L is loss function.

## Common Formulas

### Loss Functions

**Mean Squared Error (Regression)**:
$$MSE = \frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2$$

**Cross-Entropy (Classification)**:
$$CE = -\sum_{i} y_i \log(\hat{y}_i)$$

### Activation Functions

**Sigmoid**:
$$\sigma(x) = \frac{1}{1 + e^{-x}}$$

**ReLU**:
$$ReLU(x) = \max(0, x)$$

**Softmax**:
$$softmax(x_i) = \frac{e^{x_i}}{\sum_j e^{x_j}}$$

## Learning Path

1. [[Linear Algebra]] basics
2. [[Calculus Basics]] - derivatives
3. [[Statistics Fundamentals]]
4. Apply to [[Neural Networks Fundamentals]]

## See Also

- [[Machine Learning Research]]
- [[NumPy]]
- [[Python Programming]]
