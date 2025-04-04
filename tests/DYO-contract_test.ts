import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.7.1/index.ts';
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure contract owner can initialize",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        
        // Only owner can initialize
        let block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'initialize',
                [
                    types.list([types.principal(wallet1.address)]),
                    types.uint(1)
                ],
                wallet1.address
            )
        ]);
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u100)`); // err-owner-only
             // Owner can initialize
             block = chain.mineBlock([
                Tx.contractCall(
                    'yield-optimizer',
                    'initialize',
                    [
                        types.list([types.principal(wallet1.address)]),
                        types.uint(1)
                    ],
                    deployer.address
                )
            ]);
            assertEquals(block.receipts.length, 1);
            assertEquals(block.receipts[0].result, `(ok true)`);
        }
    });
    
    Clarinet.test({
        name: "Ensure only owner can add protocols",
        async fn(chain: Chain, accounts: Map<string, Account>) {
            const deployer = accounts.get('deployer')!;
            const wallet1 = accounts.get('wallet_1')!;

               // Initialize first
               let block = chain.mineBlock([
                Tx.contractCall(
                    'yield-optimizer',
                    'initialize',
                    [
                        types.list([types.principal(wallet1.address)]),
                        types.uint(1)
                    ],
                    deployer.address
                )
            ]);
    
            // Non-owner can't add protocol
            block = chain.mineBlock([
                Tx.contractCall(
                    'yield-optimizer',
                    'add-protocol',
                    [
                        types.principal(wallet1.address),
                        types.uint(5)
                    ],
                    wallet1.address
                )
            ]);
            assertEquals(block.receipts[0].result, `(err u100)`); // err-owner-only
                    // Owner can add protocol
        block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'add-protocol',
                [
                    types.principal(wallet1.address),
                    types.uint(5)
                ],
                deployer.address
            )
        ]);
        assertEquals(block.receipts[0].result, `(ok u0)`);

        // Can't add same protocol twice
        block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'add-protocol',
                [
                    types.principal(wallet1.address),
                    types.uint(5)
                ],
                deployer.address
            )
        ]);
        assertEquals(block.receipts[0].result, `(err u101)`); // err-protocol-exists
    }
});
Clarinet.test({
    name: "Test deposit and withdrawal flow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;
        const amount = 1000;
        
        // Initialize first
        let block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'initialize',
                [
                    types.list([types.principal(wallet1.address)]),
                    types.uint(1)
                ],
                deployer.address
            ),
            Tx.contractCall(
                'yield-optimizer',
                'add-protocol',
                [
                    types.principal(wallet2.address),
                    types.uint(5)
                ],
                deployer.address
            )
        ]);

        // Wallet1 deposits
        block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'deposit',
                [types.uint(amount)],
                wallet1.address
            )
        ]);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check user deposit
        let receipt = chain.callReadOnlyFn(
            'yield-optimizer',
            'get-user-deposit',
            [types.principal(wallet1.address)],
            wallet1.address
        );
        assertEquals(receipt.result, `(ok u${amount})`);

        // Check total funds
        receipt = chain.callReadOnlyFn(
            'yield-optimizer',
            'get-total-funds-locked',
            [],
            wallet1.address
        );
        assertEquals(receipt.result, `(ok u${amount})`);

        // Withdraw half
        block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'withdraw',
                [types.uint(amount/2)],
                wallet1.address
            )
        ]);
        assertEquals(block.receipts[0].result, `(ok true)`);

        // Check updated balance
        receipt = chain.callReadOnlyFn(
            'yield-optimizer',
            'get-user-deposit',
            [types.principal(wallet1.address)],
            wallet1.address
        );
        assertEquals(receipt.result, `(ok u${amount/2})`);

        // Can't withdraw more than deposited
        block = chain.mineBlock([
            Tx.contractCall(
                'yield-optimizer',
                'withdraw',
                [types.uint(amount*2)],
                wallet1.address
            )
        ]);
        assertEquals(block.receipts[0].result, `(err u103)`); // err-insufficient-balance
    }
});