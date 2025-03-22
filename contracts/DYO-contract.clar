
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
;; Keep track of all registered protocol IDs
(define-data-var protocol-count uint u0)
(define-data-var total-funds-locked uint u0)

;; Rebalancing threshold in basis points
;; If APY difference between protocols exceeds this, rebalance
(define-data-var rebalance-threshold uint u200) ;; Default 2%

;; Emergency multisig variables
(define-map authorized-signers { signer: principal } { authorized: bool })
(define-data-var required-signatures uint u3)
(define-data-var emergency-withdrawal-signatures (list 10 principal) (list))

;; Performance fee in basis points
(define-data-var performance-fee uint u1000) ;; Default 10%
(define-data-var last-fee-collection-height uint u0)

;; User deposits
(define-map user-deposits
  { user: principal }
  { amount: uint }
)
;; Initialize the contract
(define-public (initialize (signers (list 5 principal)) (signature-threshold uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (<= signature-threshold (len signers)) err-threshold-invalid)
    
    ;; Initialize authorized signers
    (map add-authorized-signer signers)
    (var-set required-signatures signature-threshold)
    
    (ok true)
  )
)

;; Helper to add a signer
(define-private (add-authorized-signer (signer principal))
  (map-set authorized-signers { signer: signer } { authorized: true })
)

;; Add a new yield protocol
(define-public (add-protocol (protocol-principal principal) (risk-score uint))
  (let ((new-id (var-get protocol-count)))
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (is-none (get-protocol-by-principal protocol-principal)) err-protocol-exists)
    (asserts! (<= risk-score u10) err-threshold-invalid)
    
    (map-set protocols
      { protocol-id: new-id }
      {
        protocol-principal: protocol-principal,
        current-apy: u0,
        risk-score: risk-score,
        allocation-percentage: u0,
        current-balance: u0
      }
    )
    
    (var-set protocol-count (+ new-id u1))
    
    (ok new-id)
  )
)

;; Helper to find protocol by principal
(define-private (get-protocol-by-principal (protocol-principal principal))
  (let ((count (var-get protocol-count)))
    (find-protocol-by-principal protocol-principal u0 count)
  )
)
(define-private (find-protocol-by-principal (protocol-principal principal) (current uint) (max uint))
  (if (>= current max)
    none
    (let ((protocol (unwrap! (map-get? protocols { protocol-id: current }) (find-protocol-by-principal protocol-principal (+ current u1) max))))
      (if (is-eq (get protocol-principal protocol) protocol-principal)
        (some { protocol-id: current, protocol-data: protocol })
        (find-protocol-by-principal protocol-principal (+ current u1) max)
      )
    )
  )
)

;; Update APY for a protocol
(define-public (update-protocol-apy (protocol-id uint) (new-apy uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (is-some (map-get? protocols { protocol-id: protocol-id })) err-protocol-not-found)
    
    (map-set protocols
      { protocol-id: protocol-id }
      (merge (unwrap-panic (map-get? protocols { protocol-id: protocol-id }))
             { current-apy: new-apy })
    )
    
    (ok true)
  )
)

;; User deposit function
(define-public (deposit (amount uint))
  (let (
    (user tx-sender)
    (current-deposit (default-to u0 (get amount (map-get? user-deposits { user: user }))))
  )
    (try! (stx-transfer? amount user (as-contract tx-sender)))
    
    ;; Update user's deposit record
    (map-set user-deposits
      { user: user }
      { amount: (+ current-deposit amount) }
    )
    
    ;; Update total funds locked
    (var-set total-funds-locked (+ (var-get total-funds-locked) amount))
    
    ;; Check if rebalancing is needed after deposit
    (if (> (var-get protocol-count) u0)
      (try! (rebalance-funds))
      (ok true)
    )
  )
)

;; User withdrawal function
(define-public (withdraw (amount uint))
  (let (
    (user tx-sender)
    (current-deposit (default-to u0 (get amount (map-get? user-deposits { user: user }))))
  )
    (asserts! (>= current-deposit amount) err-insufficient-balance)
    
    ;; First need to rebalance to ensure we have enough STX in the contract
    (try! (rebalance-funds))
    
    ;; Update user's deposit record
    (map-set user-deposits
      { user: user }
      { amount: (- current-deposit amount) }
    )
    
    ;; Update total funds locked
    (var-set total-funds-locked (- (var-get total-funds-locked) amount))
    
    ;; Transfer STX back to user
    (as-contract (stx-transfer? amount (as-contract tx-sender) user))
  )
)

;; Rebalance funds based on APY data
(define-public (rebalance-funds)
  (begin
    (asserts! (or (is-eq tx-sender contract-owner) (is-eq tx-sender (as-contract tx-sender))) err-owner-only)
    
    ;; First, collect performance fees if needed
    (try! (collect-performance-fees))
    
    ;; Then perform the rebalancing
    (try! (execute-rebalance))
    
    (ok true)
  )
)

;; Core rebalance logic
(define-private (execute-rebalance)
  (let (
    (count (var-get protocol-count))
    (total-funds (var-get total-funds-locked))
  )
    (asserts! (> count u0) err-no-eligible-protocols)
    
    ;; Find highest APY protocol with risk adjustment
    (let ((best-protocol (find-best-protocol-allocation u0 count)))
      (try! (allocate-funds best-protocol total-funds))
      (ok true)
    )
  )
)

;; Find the best protocol allocation based on APY and risk
(define-private (find-best-protocol-allocation (start uint) (end uint))
  (let (
    (allocations (calculate-optimal-allocations start end))
  )
    allocations
  )
)

;; Calculate optimal allocations based on risk-adjusted returns
(define-private (calculate-optimal-allocations (start uint) (end uint))
  (let (
    (allocation-map (generate-initial-allocations start end))
  )
    allocation-map
  )
)

;; Placeholder for the allocation algorithm
;; In a real implementation, this would use a more sophisticated algorithm
(define-private (generate-initial-allocations (start uint) (end uint))
  (let (
    (allocation-list (list u0 u1 u2 u3 u4))
  )
    allocation-list
  )
)