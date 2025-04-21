
# 🧠 Dynamic Yield Optimizer

A smart contract written in Clarity for the Stacks blockchain that intelligently allocates user deposits across multiple yield-generating protocols based on real-time APY (Annual Percentage Yield) and risk data. It includes built-in rebalancing, emergency withdrawal capabilities via multisig, and performance fee handling.

---

## 🚀 Features

- 📈 **Automated Yield Optimization**: Rebalances funds based on APY and risk-adjusted metrics.
- 🔐 **Multisig Emergency Withdrawals**: Secure mechanism for fund recovery in case of protocol issues.
- 💰 **Performance Fee Collection**: Automatically collects protocol fees on yield profits.
- 🧮 **Custom Thresholds**: Adjustable rebalancing and fee parameters.
- 👥 **User Deposit Tracking**: Transparent fund management with user-specific balances.

---

## 🛠 Contract Overview

### 📄 Core Components

| Feature                        | Description |
|-------------------------------|-------------|
| `protocols`                   | Map to store protocol info (principal, APY, risk, etc.) |
| `user-deposits`              | Tracks individual user deposits |
| `rebalance-funds`            | Public function to redistribute funds based on yield |
| `emergency-withdraw`         | Multisig-enabled function for critical fund rescue |
| `performance-fee`            | Set and update the percentage fee collected on yield |
| `initialize`                 | Owner-only setup for signer list and emergency thresholds |

---

## 📦 Installation

```bash
git clone https://github.com/your-username/yield-optimizer.git
cd yield-optimizer
```

Ensure you have [Clarinet](https://docs.hiro.so/clarinet/get-started/installation) installed:

```bash
clarinet check
```

---

## 🔧 Configuration

The contract supports configuration of:

- **Rebalance Threshold** (default: 2%)
- **Performance Fee** (default: 10%)
- **Emergency Signer Threshold** (default: 3 of 5)

You can configure these at deployment or via admin-only setters:
```clojure
(set-rebalance-threshold u300) ; 3%
(set-performance-fee u1500)     ; 15%
```

---

## 🧪 Running Tests

Tests are written in **TypeScript** using Clarinet.

### 📁 Test File Location:
```
tests/yield-optimizer_test.ts
```

### ✅ Run the Tests

```bash
clarinet test
```

### ✅ Test Coverage

The test script covers:
- Contract initialization with multisig
- Protocol registration and APY updates
- Deposits and withdrawals
- Fund rebalancing
- Fee collection over simulated time
- Emergency withdrawal logic (partial simulation)

---

## 🔍 Contract Functions

### ✅ Public Functions

| Function                         | Description |
|----------------------------------|-------------|
| `initialize(signers, threshold)` | Initializes multisig config |
| `add-protocol(principal, risk)`  | Adds new yield protocol |
| `update-protocol-apy(id, apy)`   | Updates protocol APY |
| `deposit(amount)`                | Deposit STX into optimizer |
| `withdraw(amount)`               | Withdraw STX |
| `rebalance-funds()`              | Rebalances funds across protocols |
| `set-rebalance-threshold(val)`   | Updates rebalance sensitivity |
| `set-performance-fee(val)`       | Updates fee % |
| `execute-emergency-withdraw(to)`| Trigger emergency withdrawal if quorum is met |

### 🧾 Read-Only Functions

| Function                       | Returns |
|--------------------------------|---------|
| `get-user-deposit(user)`       | User’s STX deposit |
| `get-protocol-info(id)`        | Details of a yield protocol |
| `get-performance-fee()`        | Current fee in basis points |
| `get-total-funds-locked()`     | Total STX managed by contract |

---

## 🔒 Multisig Emergency Withdrawals

1. Set signers and required threshold via `initialize`
2. Signers append their signatures (function can be extended for real signature checking)
3. Once threshold met, call `execute-emergency-withdraw` to move all funds

---

## 📘 Example Usage

### 📌 Initialize Contract
```clojure
(initialize (list 'wallet_1 'wallet_2) u2)
```

### 📌 Add a Protocol
```clojure
(add-protocol 'protocol-1-principal u5)
```

### 📌 Deposit STX
```clojure
(deposit u1000000)
```

### 📌 Trigger Rebalancing
```clojure
(rebalance-funds)
```

---

## 🔐 Security Considerations

- Only the contract owner can add protocols or update core parameters.
- Rebalancing logic is adjustable to prevent overtrading.
- Emergency multisig ensures funds can be recovered if needed.
- Withdrawals are only allowed up to the user's deposit.

