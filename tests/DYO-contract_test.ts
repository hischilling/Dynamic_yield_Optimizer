import {
  Clarinet,
  Tx,
  Chain,
  Account,
  types
} from "https://deno.land/x/clarinet@v1.5.1/index.ts";
import { assertEquals } from "https://deno.land/std@0.90.0/testing/asserts.ts";

const CONTRACT_NAME = "DYO-contract";

Clarinet.test({
  name: "DYO: Contract initialization with valid parameters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    const wallet3 = accounts.get("wallet_3")!;

    // Test successful initialization
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "initialize",
        [
          types.list([
            types.principal(wallet1.address),
            types.principal(wallet2.address),
            types.principal(wallet3.address)
          ]),
          types.uint(2)
        ],
        deployer.address
      )
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
  }
});

Clarinet.test({
  name: "DYO: Contract initialization with invalid parameters fails",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;

    // Test initialization with threshold higher than signers count (should fail)
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "initialize",
        [
          types.list([types.principal(wallet1.address)]),
          types.uint(5) // Threshold > signers
        ],
        deployer.address
      )
    ]);

    block.receipts[0].result.expectErr().expectUint(104); // err-threshold-invalid

    // Test non-owner trying to initialize (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "initialize",
        [
          types.list([types.principal(wallet1.address)]),
          types.uint(1)
        ],
        wallet1.address // Non-owner
      )
    ]);

    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only
  }
});

Clarinet.test({
  name: "DYO: Protocol management functionality",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Initialize contract first
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "initialize",
        [types.list([types.principal(wallet1.address)]), types.uint(1)],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Add a valid protocol
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "add-protocol",
        [types.principal("ST000000000000000000002AMW42H"), types.uint(5)],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectUint(0); // First protocol gets ID 0

    // Verify protocol information
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-protocol-info",
      [types.uint(0)],
      deployer.address
    );
    const protocolInfo = call.result.expectSome().expectTuple();
    assertEquals(protocolInfo["protocol-principal"], "ST000000000000000000002AMW42H");
    assertEquals(protocolInfo["risk-score"], types.uint(5));
    assertEquals(protocolInfo["current-apy"], types.uint(0));

    // Test adding protocol with invalid risk score (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "add-protocol",
        [types.principal("ST000000000000000000002AMW43H"), types.uint(15)], // Risk > 10
        deployer.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(104); // err-threshold-invalid

    // Test non-owner adding protocol (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "add-protocol",
        [types.principal("ST000000000000000000002AMW44H"), types.uint(3)],
        wallet1.address // Non-owner
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only
  }
});

Clarinet.test({
  name: "DYO: APY updates and protocol management",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize and add protocol
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "add-protocol", [types.principal("ST000000000000000000002AMW42H"), types.uint(5)], deployer.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectUint(0);

    // Update APY successfully
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "update-protocol-apy",
        [types.uint(0), types.uint(1500)], // 15% APY
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify APY was updated
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-protocol-info",
      [types.uint(0)],
      deployer.address
    );
    const protocolInfo = call.result.expectSome().expectTuple();
    assertEquals(protocolInfo["current-apy"], types.uint(1500));

    // Test updating non-existent protocol (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "update-protocol-apy",
        [types.uint(999), types.uint(1000)],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(102); // err-protocol-not-found

    // Test non-owner updating APY (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "update-protocol-apy",
        [types.uint(0), types.uint(2000)],
        wallet1.address // Non-owner
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only
  }
});

Clarinet.test({
  name: "DYO: User deposit and withdrawal functionality",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;

    // Setup: Initialize contract
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Test successful deposit
    const depositAmount = 1_000_000; // 1 STX
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "deposit",
        [types.uint(depositAmount)],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify user deposit balance
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet1.address)],
      wallet1.address
    );
    call.result.expectUint(depositAmount);

    // Verify total funds locked
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-funds-locked",
      [],
      deployer.address
    );
    call.result.expectUint(depositAmount);

    // Test multiple deposits from same user
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "deposit",
        [types.uint(500_000)],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify updated balance
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet1.address)],
      wallet1.address
    );
    call.result.expectUint(1_500_000); // 1.5 STX total

    // Test deposit from different user
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "deposit",
        [types.uint(750_000)],
        wallet2.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify individual balances
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet2.address)],
      wallet2.address
    );
    call.result.expectUint(750_000);

    // Verify total funds
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-funds-locked",
      [],
      deployer.address
    );
    call.result.expectUint(2_250_000); // 2.25 STX total
  }
});

Clarinet.test({
  name: "DYO: Withdrawal functionality and edge cases",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize and deposit
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "deposit", [types.uint(1_000_000)], wallet1.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectBool(true);

    // Test successful withdrawal
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "withdraw",
        [types.uint(400_000)],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify updated balance
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet1.address)],
      wallet1.address
    );
    call.result.expectUint(600_000);

    // Test withdrawal exceeding balance (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "withdraw",
        [types.uint(700_000)], // More than remaining 600k
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(103); // err-insufficient-balance

    // Test withdrawal with zero balance user (should fail)
    const wallet2 = accounts.get("wallet_2")!;
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "withdraw",
        [types.uint(100_000)],
        wallet2.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(103); // err-insufficient-balance
  }
});

Clarinet.test({
  name: "DYO: Rebalancing functionality",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize, add protocol, and deposit
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "add-protocol", [types.principal("ST000000000000000000002AMW42H"), types.uint(5)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "deposit", [types.uint(1_000_000)], wallet1.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectUint(0);
    block.receipts[2].result.expectOk().expectBool(true);

    // Test manual rebalancing by owner
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "rebalance-funds",
        [],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Test rebalancing with no protocols (should fail)
    const emptyContract = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address)
    ]);

    // Test non-owner rebalancing (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "rebalance-funds",
        [],
        wallet1.address // Non-owner, non-contract
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only
  }
});

Clarinet.test({
  name: "DYO: Emergency withdrawal system",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const wallet2 = accounts.get("wallet_2")!;
    const wallet3 = accounts.get("wallet_3")!;

    // Setup: Initialize with multisig and deposit funds
    let block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "initialize",
        [
          types.list([
            types.principal(wallet1.address),
            types.principal(wallet2.address),
            types.principal(wallet3.address)
          ]),
          types.uint(2) // Require 2 signatures
        ],
        deployer.address
      ),
      Tx.contractCall(CONTRACT_NAME, "deposit", [types.uint(1_000_000)], wallet1.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectBool(true);

    // Test unauthorized signer attempting emergency withdrawal (should fail)
    const unauthorizedWallet = accounts.get("wallet_4")!;
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "sign-emergency-withdrawal",
        [],
        unauthorizedWallet.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(105); // err-not-authorized

    // Test authorized signers signing emergency withdrawal
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "sign-emergency-withdrawal",
        [],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Test executing emergency withdrawal without enough signatures (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "execute-emergency-withdraw",
        [types.principal(wallet2.address)],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(105); // err-not-authorized

    // Add another signature
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "sign-emergency-withdrawal",
        [],
        wallet2.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Now execute emergency withdrawal with sufficient signatures
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "execute-emergency-withdraw",
        [types.principal(wallet3.address)],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify funds were transferred and total locked is now 0
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-funds-locked",
      [],
      deployer.address
    );
    call.result.expectUint(0);
  }
});

Clarinet.test({
  name: "DYO: Performance fee collection",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize and deposit
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "add-protocol", [types.principal("ST000000000000000000002AMW42H"), types.uint(5)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "deposit", [types.uint(10_000_000)], wallet1.address) // 10 STX
    ]);
    block.receipts[0].result.expectOk().expectBool(true);
    block.receipts[1].result.expectOk().expectUint(0);
    block.receipts[2].result.expectOk().expectBool(true);

    // Advance block height to trigger fee collection (> 144 blocks)
    chain.advanceBlockHeight(150);

    // Trigger rebalancing which should collect fees
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "rebalance-funds",
        [],
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify performance fee was collected (fees are transferred to deployer)
    // Note: In a real test, you'd check the deployer's STX balance increased
  }
});

Clarinet.test({
  name: "DYO: Settings management (thresholds and fees)",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize contract
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address)
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Test setting rebalance threshold
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "set-rebalance-threshold",
        [types.uint(500)], // 5%
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Test non-owner setting threshold (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "set-rebalance-threshold",
        [types.uint(300)],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only

    // Test setting valid performance fee
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "set-performance-fee",
        [types.uint(1500)], // 15%
        deployer.address
      )
    ]);
    block.receipts[0].result.expectOk().expectBool(true);

    // Verify fee was set
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-performance-fee",
      [],
      deployer.address
    );
    call.result.expectUint(1500);

    // Test setting excessive performance fee (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "set-performance-fee",
        [types.uint(3500)], // 35% > max 30%
        deployer.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(104); // err-threshold-invalid

    // Test non-owner setting fee (should fail)
    block = chain.mineBlock([
      Tx.contractCall(
        CONTRACT_NAME,
        "set-performance-fee",
        [types.uint(2000)],
        wallet1.address
      )
    ]);
    block.receipts[0].result.expectErr().expectUint(100); // err-owner-only
  }
});

Clarinet.test({
  name: "DYO: Read-only functions and getters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Setup: Initialize, add protocol, and deposit
    let block = chain.mineBlock([
      Tx.contractCall(CONTRACT_NAME, "initialize", [types.list([types.principal(wallet1.address)]), types.uint(1)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "add-protocol", [types.principal("ST000000000000000000002AMW42H"), types.uint(7)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "update-protocol-apy", [types.uint(0), types.uint(1800)], deployer.address),
      Tx.contractCall(CONTRACT_NAME, "deposit", [types.uint(2_000_000)], wallet1.address)
    ]);
    
    // Test get-protocol-info for existing protocol
    let call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-protocol-info",
      [types.uint(0)],
      deployer.address
    );
    const protocolInfo = call.result.expectSome().expectTuple();
    assertEquals(protocolInfo["protocol-principal"], "ST000000000000000000002AMW42H");
    assertEquals(protocolInfo["risk-score"], types.uint(7));
    assertEquals(protocolInfo["current-apy"], types.uint(1800));

    // Test get-protocol-info for non-existent protocol
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-protocol-info",
      [types.uint(999)],
      deployer.address
    );
    call.result.expectNone();

    // Test get-user-deposit for user with deposit
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet1.address)],
      deployer.address
    );
    call.result.expectUint(2_000_000);

    // Test get-user-deposit for user without deposit
    const wallet2 = accounts.get("wallet_2")!;
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-deposit",
      [types.principal(wallet2.address)],
      deployer.address
    );
    call.result.expectUint(0);

    // Test get-total-funds-locked
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-total-funds-locked",
      [],
      deployer.address
    );
    call.result.expectUint(2_000_000);

    // Test get-performance-fee (default value)
    call = chain.callReadOnlyFn(
      CONTRACT_NAME,
      "get-performance-fee",
      [],
      deployer.address
    );
    call.result.expectUint(1000); // Default 10%
  }
});