/**
 * Test Suite for Auto Debt Payment System
 * Verifies that debt is automatically paid when players receive money from any source:
 * 1. Passing GO (movePlayer, movePlayerTo)
 * 2. Collecting Free Parking
 * 3. Receiving Rent (as owner)
 * 4. Chance/Community Chest cards giving money
 * 5. Collecting from other players (moneyFromPlayers cards)
 * 6. Receiving money in trades
 * 7. Catch-all in checkBankruptcy
 * 
 * Run with: node server/test-auto-debt-payment.js
 */

const { Game } = require('./game');

// ═══════════════════════════════════════════════════════════════════════
// TEST HARNESS
// ═══════════════════════════════════════════════════════════════════════

let testsPassed = 0;
let testsFailed = 0;

function log(msg, type = 'info') {
    const colors = {
        info: '\x1b[36m',    // Cyan
        PASS: '\x1b[32m',    // Green
        FAIL: '\x1b[31m',    // Red
        error: '\x1b[31m',   // Red
        success: '\x1b[32m', // Green
        reset: '\x1b[0m'
    };
    console.log(`${colors[type] || ''}[${type.toUpperCase()}]${colors.reset} ${msg}`);
}

function assert(condition, message) {
    if (condition) {
        log(message, 'PASS');
        testsPassed++;
    } else {
        log(message, 'FAIL');
        testsFailed++;
    }
}

function setupDebtScenario() {
    const game = new Game('test-debt', 'Debt Test', 4, false, false);
    const debtor = game.addPlayer('debtor-id', 'Debtor');
    const creditor = game.addPlayer('creditor-id', 'Creditor');
    game.start();

    // Find debtor's index after shuffle and set as current player
    const debtorIndex = game.players.findIndex(p => p.id === debtor.id);
    game.currentPlayerIndex = debtorIndex;

    // Setup: Debtor owes £300 to Creditor
    debtor.money = 0;
    debtor.debt = { amount: 300, creditor: creditor.id };
    creditor.money = 1000;

    return { game, debtor, creditor };
}

// ═══════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════

function testDebtPaymentOnPassingGO() {
    console.log('\n--- Test: Debt Payment on Passing GO (movePlayer) ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Debtor is at position 35, moves 7 spaces, passes GO
    debtor.position = 35;
    game.movePlayer(debtor, 7); // Should land on 2, passing GO

    // Should have received £200, paid £200 toward debt
    assert(debtor.money === 0, 'Debtor money should be £0 (all went to debt)');
    assert(debtor.debt.amount === 100, 'Debt should be reduced to £100 (300 - 200)');
    assert(creditor.money === 1200, 'Creditor should receive £200 (1000 + 200)');

    log('Passed GO debt payment test complete', 'success');
}

function testDebtPaymentOnPassingGOMovePlayerTo() {
    console.log('\n--- Test: Debt Payment on Passing GO (movePlayerTo) ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Debtor is at position 35, card moves them to position 5 (passes GO)
    debtor.position = 35;
    game.movePlayerTo(debtor, 5, true); // collectGo = true

    // Should have received £200, paid £200 toward debt
    assert(debtor.money === 0, 'Debtor money should be £0');
    assert(debtor.debt.amount === 100, 'Debt should be reduced to £100');
    assert(creditor.money === 1200, 'Creditor should receive £200');

    log('MovePlayerTo GO debt payment test complete', 'success');
}

function testDebtPaymentOnFreeParking() {
    console.log('\n--- Test: Debt Payment on Free Parking ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Setup: Free Parking has £500
    game.freeParking = 500;
    debtor.position = 20; // Free Parking position
    // currentPlayerIndex is already set to debtor by setupDebtScenario

    const result = game.handleLanding();

    // Should have received £500, paid £300 debt, kept £200
    assert(debtor.money === 200, 'Debtor should have £200 (500 - 300 debt)');
    assert(debtor.debt === null, 'Debt should be fully cleared');
    assert(creditor.money === 1300, 'Creditor should receive £300 (full debt)');
    assert(result.action === 'freeParking', 'Action should be freeParking');

    log('Free Parking debt payment test complete', 'success');
}

function testDebtPaymentOnReceivingRent() {
    console.log('\n--- Test: Debt Payment on Receiving Rent ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Setup: Debtor owns a property, someone lands on it
    const propertyIndex = 1; // Old Kent Road
    const property = game.board[propertyIndex];
    property.owner = debtor.id;
    debtor.properties.push(propertyIndex);

    // Third player to pay rent
    const payer = game.addPlayer('payer-id', 'Payer');
    payer.money = 500;

    // Mock calculateRent to return £100
    game.calculateRent = () => 100;

    game.payRent(payer, property, 100);

    // Debtor received £100 rent, should pay toward debt
    assert(debtor.money === 0, 'Debtor money should still be £0 (rent applied to debt)');
    assert(debtor.debt.amount === 200, 'Debt should be reduced to £200 (300 - 100)');
    assert(creditor.money === 1100, 'Creditor should receive £100');
    assert(payer.money === 400, 'Payer should have £400 (500 - 100)');

    log('Receiving rent debt payment test complete', 'success');
}

function testDebtPaymentOnMoneyCard() {
    console.log('\n--- Test: Debt Payment on Money Card ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Simulate receiving £150 from a Chance card
    const card = { action: 'money', amount: 150, text: 'Bank pays you £150' };
    game.currentPlayerIndex = 0;

    game.executeCard(debtor, card, 'chance');

    // Should have received £150, all applied to debt
    assert(debtor.money === 0, 'Debtor money should be £0');
    assert(debtor.debt.amount === 150, 'Debt should be reduced to £150 (300 - 150)');
    assert(creditor.money === 1150, 'Creditor should receive £150');

    log('Money card debt payment test complete', 'success');
}

function testDebtPaymentOnMoneyFromPlayersCard() {
    console.log('\n--- Test: Debt Payment on "Collect from Each Player" Card ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Add more players to collect from
    const player3 = game.addPlayer('p3', 'Player3');
    const player4 = game.addPlayer('p4', 'Player4');
    player3.money = 500;
    player4.money = 500;
    creditor.money = 1000;

    // Card: Collect £50 from each player
    const card = { action: 'moneyFromPlayers', amount: 50, text: 'Collect £50 from each player' };
    game.currentPlayerIndex = 0;

    game.executeCard(debtor, card, 'community-chest');

    // Debtor collects £50 from 3 players = £150, applied to debt
    assert(debtor.money === 0, 'Debtor money should be £0');
    assert(debtor.debt.amount === 150, 'Debt should be reduced to £150 (300 - 150)');
    assert(creditor.money === 1100, 'Creditor should receive £150 debt payment (minus £50 paid to debtor)');

    log('Money from players card debt payment test complete', 'success');
}

function testDebtPaymentOnTradeReceivingMoney() {
    console.log('\n--- Test: Debt Payment on Trade (Receiving Money) ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Setup: Debtor has a property to trade
    const propertyIndex = 3;
    game.board[propertyIndex].owner = debtor.id;
    debtor.properties.push(propertyIndex);

    // Third player offers £200 for the property
    const buyer = game.addPlayer('buyer-id', 'Buyer');
    buyer.money = 500;

    // Create and execute trade
    const trade = {
        id: 'trade-1',
        from: buyer.id,
        to: debtor.id,
        offer: { money: 200, properties: [] },
        request: { money: 0, properties: [propertyIndex] },
        status: 'pending'
    };
    game.trades.push(trade);

    const result = game.acceptTrade('trade-1', debtor);

    // Debtor received £200, should apply to debt
    assert(debtor.money === 0, 'Debtor money should be £0');
    assert(debtor.debt.amount === 100, 'Debt should be reduced to £100 (300 - 200)');
    assert(creditor.money === 1200, 'Creditor should receive £200');
    assert(result.success === true, 'Trade should be successful');

    log('Trade receiving money debt payment test complete', 'success');
}

function testDebtFullyCleared() {
    console.log('\n--- Test: Debt Fully Cleared with Surplus ---');

    // Create fresh game for this test
    const game = new Game('test-cleared', 'Cleared Test', 4, false, false);
    const debtor = game.addPlayer('debtor-id', 'Debtor');
    const creditor = game.addPlayer('creditor-id', 'Creditor');
    game.start();

    // Setup: Debtor owes £300 to Creditor
    debtor.money = 0;
    debtor.debt = { amount: 300, creditor: creditor.id };
    creditor.money = 1000;

    // Find debtor's index after shuffle and set as current player
    const debtorIndex = game.players.findIndex(p => p.id === debtor.id);
    game.currentPlayerIndex = debtorIndex;

    // Debtor receives £500 from Free Parking
    game.freeParking = 500;
    debtor.position = 20;

    game.handleLanding();

    // Should pay off £300 debt, keep £200
    assert(debtor.money === 200, 'Debtor should have £200 surplus');
    assert(debtor.debt === null, 'Debt should be null (fully cleared)');
    assert(creditor.money === 1300, 'Creditor should receive full £300');

    log('Debt fully cleared test complete', 'success');
}

function testDebtPaymentCatchAllInCheckBankruptcy() {
    console.log('\n--- Test: Catch-All Debt Payment in checkBankruptcy ---');

    const { game, debtor, creditor } = setupDebtScenario();

    // Manually add money to debtor without triggering processDebtPayment
    // This simulates an edge case where money was added but debt wasn't processed
    debtor.money = 150;

    // Call checkBankruptcy - should trigger catch-all payment
    game.checkBankruptcy(debtor);

    // £150 should be applied to debt
    assert(debtor.money === 0, 'Debtor money should be £0');
    assert(debtor.debt.amount === 150, 'Debt should be reduced to £150');
    assert(creditor.money === 1150, 'Creditor should receive £150');

    log('Catch-all debt payment test complete', 'success');
}

function testNoDebtScenario() {
    console.log('\n--- Test: No Debt - Normal Money Flow ---');

    const game = new Game('test-no-debt', 'No Debt Test', 4, false, false);
    const player = game.addPlayer('player-id', 'Player');
    const other = game.addPlayer('other-id', 'Other');
    game.start();

    player.money = 1000;
    player.debt = null;

    // Pass GO
    player.position = 38;
    game.movePlayer(player, 4);

    // Should simply add £200
    assert(player.money === 1200, 'Player should have £1200 (no debt to pay)');
    assert(player.debt === null, 'Debt should remain null');

    log('No debt scenario test complete', 'success');
}

function testProcessDebtPaymentNotCalledForPayingPlayer() {
    console.log('\n--- Test: Rent Payer Debt Not Affected ---');

    const game = new Game('test-payer', 'Payer Test', 4, false, false);
    const owner = game.addPlayer('owner-id', 'Owner');
    const renter = game.addPlayer('renter-id', 'Renter');
    game.start();

    // Owner has no debt
    owner.money = 500;
    owner.debt = null;

    // Renter has debt but is PAYING rent (shouldn't trigger debt payment for renter)
    renter.money = 300;
    renter.debt = { amount: 100, creditor: 'someone-else' };

    // Owner owns property
    const propertyIndex = 1;
    game.board[propertyIndex].owner = owner.id;
    owner.properties.push(propertyIndex);

    game.calculateRent = () => 50;
    game.payRent(renter, game.board[propertyIndex], 50);

    // Renter paid rent, their debt should NOT be affected (they didn't receive money)
    assert(renter.money === 250, 'Renter should have £250 (paid £50 rent)');
    assert(renter.debt.amount === 100, 'Renter debt should remain £100');

    // Owner received rent, owner has no debt so just keeps money
    assert(owner.money === 550, 'Owner should have £550');

    log('Rent payer debt not affected test complete', 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════

function runTests() {
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('         AUTO DEBT PAYMENT SYSTEM - TEST SUITE');
    console.log('═══════════════════════════════════════════════════════════════════════');

    try { testDebtPaymentOnPassingGO(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnPassingGOMovePlayerTo(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnFreeParking(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnReceivingRent(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnMoneyCard(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnMoneyFromPlayersCard(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentOnTradeReceivingMoney(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtFullyCleared(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testDebtPaymentCatchAllInCheckBankruptcy(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testNoDebtScenario(); } catch (e) { log(`Error: ${e.message}`, 'error'); }
    try { testProcessDebtPaymentNotCalledForPayingPlayer(); } catch (e) { log(`Error: ${e.message}`, 'error'); }

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log('═══════════════════════════════════════════════════════════════════════');

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
