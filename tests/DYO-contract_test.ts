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