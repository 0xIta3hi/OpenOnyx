# 🧠 Neural Networks Fundamentals

## What is a Neural Network?

A computational model inspired by biological neurons, consisting of layers of interconnected nodes.

## Architecture

```
Input Layer    Hidden Layers    Output Layer
    ○              ○                ○
    ○          ○   ○   ○            ○
    ○              ○                ○
    ○          ○   ○   ○
```

## Key Components

### 1. Neurons
Each neuron computes: `y = activation(Σ(w_i * x_i) + b)`

### 2. Activation Functions

| Function | Formula | Use Case |
|----------|---------|----------|
| ReLU | max(0, x) | Hidden layers |
| Sigmoid | 1/(1+e^-x) | Binary output |
| Softmax | e^x_i/Σe^x_j | Multi-class |
| Tanh | (e^x-e^-x)/(e^x+e^-x) | RNNs |

### 3. Loss Functions
- **MSE**: Regression
- **Cross-entropy**: Classification
- **Hinge loss**: SVM-style

### 4. Backpropagation
The algorithm for computing gradients using chain rule.

## Code Example

```python
import torch
import torch.nn as nn

class SimpleNN(nn.Module):
    def __init__(self, input_size, hidden_size, output_size):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, output_size)
        )
    
    def forward(self, x):
        return self.layers(x)
```

## See Also

- [[Transformer Architecture]]
- [[Convolutional Neural Networks]]
- [[Recurrent Neural Networks]]
- [[Mathematics for ML]]
