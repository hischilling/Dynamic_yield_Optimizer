import {
    Clarinet,
    Tx,
    Chain,
    Account,
    types
  } from "https://deno.land/x/clarinet@v1.5.1/index.ts";
  
  Clarinet.test({
    name: "Dynamic Yield Optimizer: end-to-end basic flow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
      const deployer = accounts.get("deployer")!;
      const wallet1 = accounts.get("wallet_1")!;
      const wallet2 = accounts.get("wallet_2")!;
  
      // Initialize multisig with 3 signers
      let block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "initialize",
          [types.list([types.principal(wallet1.address), types.principal(wallet2.address)]), types.uint(2)],
          deployer.address
        )
      ]);
      block.receipts[0].result.expectOk().expectBool(true);
  
      // Add a yield protocol
      block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "add-protocol",
          [types.principal("ST000000000000000000002AMW42H"), types.uint(5)],
          deployer.address
        )
      ]);
      block.receipts[0].result.expectOk().expectUint(0); // Protocol ID 0
  
      // Update protocol APY
      block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "update-protocol-apy",
          [types.uint(0), types.uint(1200)], // 12%
          deployer.address
        )
      ]);
      block.receipts[0].result.expectOk().expectBool(true);
  
      // Deposit STX from wallet_1
      block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "deposit",
          [types.uint(1_000_000)],
          wallet1.address
        )
      ]);
      block.receipts[0].result.expectOk().expectBool(true);
  
      // Check user deposit balance
      let call = chain.callReadOnlyFn(
        "yield-optimizer",
        "get-user-deposit",
        [types.principal(wallet1.address)],
        wallet1.address
      );
      call.result.expectUint(1_000_000);
  
      // Trigger withdrawal
      block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "withdraw",
          [types.uint(500_000)],
          wallet1.address
        )
      ]);
      block.receipts[0].result.expectOk().expectBool(true);
  
      // Collect performance fees (manually increase block height to trigger)
      chain.advanceBlockHeight(150);
      block = chain.mineBlock([
        Tx.contractCall("yield-optimizer", "rebalance-funds", [], deployer.address)
      ]);
      block.receipts[0].result.expectOk().expectBool(true);
  
      // Submit emergency signatures
      block = chain.mineBlock([
        Tx.contractCall(
          "yield-optimizer",
          "execute-emergency-withdraw",
          [types.principal(wallet2.address)],
          deployer.address
        )
      ]);
      block.receipts[0].result.expectErr().expectUint(105); // Not enough signatures
  
      // Add emergency signatures (mocked for now)
      // Ideally you'd simulate signature submission if implemented as a function
  
      // Done
    },
  });
  