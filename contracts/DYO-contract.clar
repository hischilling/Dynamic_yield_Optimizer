;; Dynamic Yield Optimizer
;; A smart contract that automatically reallocates funds across multiple yield-generating protocols
;; based on real-time APY data.

(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-protocol-exists (err u101))
(define-constant err-protocol-not-found (err u102))
(define-constant err-insufficient-balance (err u103))
(define-constant err-threshold-invalid (err u104))
(define-constant err-not-authorized (err u105))
(define-constant err-no-eligible-protocols (err u106))

;; Protocol structure
;; Each yield protocol has:
;; - contract principal
;; - current APY (in basis points, 1% = 100)
;; - risk score (1-10, 10 being highest risk)
;; - allocation percentage (0-10000, representing 0-100%)
;; - current balance

(define-map protocols
  { protocol-id: uint }
  {
    protocol-principal: principal,
    current-apy: uint,
    risk-score: uint,
    allocation-percentage: uint,
    current-balance: uint
  }
)
