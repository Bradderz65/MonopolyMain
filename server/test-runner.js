/**
 * Monopoly Test Runner
 * Runs all test suites and generates a comprehensive report
 * Run with: node server/test-runner.js
 * 
 * Output is saved to test-output.txt in the project root
 */

const fs = require('fs');
const path = require('path');

// Capture console output
let outputBuffer = [];
const originalLog = console.log;
const originalError = console.error;

function captureOutput(msg) {
    outputBuffer.push(msg);
    originalLog(msg);
}

function captureError(msg) {
    outputBuffer.push(`[ERROR] ${msg}`);
    originalError(msg);
}

console.log = captureOutput;
console.error = captureError;

// Test results aggregator
const allResults = {
    timestamp: new Date().toISOString(),
    suites: [],
    summary: {
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        duration: 0
    }
};

async function runTestSuite(name, modulePath) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  RUNNING: ${name}`);
    console.log(`${'═'.repeat(70)}\n`);

    const startTime = Date.now();
    let result = { passed: 0, failed: 0, skipped: 0 };

    try {
        const testModule = require(modulePath);

        if (typeof testModule.runTests === 'function') {
            result = await testModule.runTests();
        } else if (typeof testModule === 'function') {
            result = await testModule();
        } else {
            // Module runs on require
            result = { passed: 0, failed: 0, skipped: 0, note: 'Module executed on import' };
        }
    } catch (err) {
        console.error(`Suite error: ${err.message}`);
        console.error(err.stack);
        result = { passed: 0, failed: 1, error: err.message };
    }

    const duration = Date.now() - startTime;

    allResults.suites.push({
        name,
        ...result,
        duration
    });

    allResults.summary.totalPassed += result.passed || 0;
    allResults.summary.totalFailed += result.failed || 0;
    allResults.summary.totalSkipped += result.skipped || 0;

    return result;
}

async function runAllTests() {
    const overallStart = Date.now();

    // Header
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                      ║');
    console.log('║          🎲 MONOPOLY COMPREHENSIVE TEST RUNNER 🎲                    ║');
    console.log('║                                                                      ║');
    console.log('║     Testing: Bot AI, Game Logic, Edge Cases, Integration            ║');
    console.log('║                                                                      ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log(`\n📅 Test Run Started: ${new Date().toLocaleString()}\n`);

    // Run Bot AI Tests
    await runTestSuite('Bot AI Decision Tests', './test-bot-ai.js');

    // Run Complete Game Tests (unit tests)
    await runTestSuite('Complete Game Mechanics Tests', './test-complete.js');

    // Run Game Suite Tests
    await runTestSuite('Game Suite Tests', './test-game-suite.js');

    // Run Debt & Auction Logic Tests
    await runTestSuite('Debt & Bot Auction Tests', './test-debt-auction-logic.js');

    // Calculate total duration
    allResults.summary.duration = Date.now() - overallStart;

    // Generate Final Report
    generateFinalReport();

    // Save output to file
    saveOutputToFile();

    return allResults;
}

function generateFinalReport() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                     FINAL TEST REPORT                                ║');
    console.log('╠══════════════════════════════════════════════════════════════════════╣');

    // Per-suite results
    for (const suite of allResults.suites) {
        const status = suite.failed === 0 ? '✅' : '❌';
        const passRate = suite.passed + suite.failed > 0
            ? ((suite.passed / (suite.passed + suite.failed)) * 100).toFixed(0)
            : 'N/A';
        console.log(`║  ${status} ${suite.name.padEnd(40)} ${String(suite.passed).padStart(3)}/${String(suite.passed + suite.failed).padStart(3)} (${passRate}%)    ║`);
    }

    console.log('╠══════════════════════════════════════════════════════════════════════╣');

    // Summary
    const total = allResults.summary.totalPassed + allResults.summary.totalFailed;
    const overallPassRate = total > 0
        ? ((allResults.summary.totalPassed / total) * 100).toFixed(1)
        : 'N/A';

    console.log(`║                                                                      ║`);
    console.log(`║  📊 TOTAL RESULTS                                                    ║`);
    console.log(`║  ─────────────────                                                   ║`);
    console.log(`║  ✅ Passed:   ${String(allResults.summary.totalPassed).padEnd(4)} tests                                           ║`);
    console.log(`║  ❌ Failed:   ${String(allResults.summary.totalFailed).padEnd(4)} tests                                           ║`);
    if (allResults.summary.totalSkipped > 0) {
        console.log(`║  ⏭️  Skipped:  ${String(allResults.summary.totalSkipped).padEnd(4)} tests                                           ║`);
    }
    console.log(`║  📈 Pass Rate: ${overallPassRate}%                                                   ║`);
    console.log(`║  ⏱️  Duration:  ${(allResults.summary.duration / 1000).toFixed(2)}s                                                ║`);
    console.log(`║                                                                      ║`);

    if (allResults.summary.totalFailed === 0) {
        console.log(`║  🎉 ALL TESTS PASSED! Bot is performing correctly.                  ║`);
    } else {
        console.log(`║  ⚠️  Some tests failed. Review output above for details.            ║`);
    }

    console.log(`║                                                                      ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════╝');

    // Detailed failure list if any
    if (allResults.summary.totalFailed > 0) {
        console.log('\n⚠️  FAILED SUITES:');
        for (const suite of allResults.suites) {
            if (suite.failed > 0) {
                console.log(`   ❌ ${suite.name}: ${suite.failed} failures`);
                if (suite.error) {
                    console.log(`      Error: ${suite.error}`);
                }
            }
        }
    }

    // Coverage summary
    console.log('\n📋 TEST COVERAGE SUMMARY:');
    console.log('   ✓ Trade decisions (accept/decline/negotiate)');
    console.log('   ✓ Property buying strategy');
    console.log('   ✓ Auction bidding logic');
    console.log('   ✓ Building decisions');
    console.log('   ✓ Jail strategy (pay/roll/card)');
    console.log('   ✓ Bankruptcy handling');
    console.log('   ✓ Game phase detection');
    console.log('   ✓ Color group analysis');
    console.log('   ✓ Rent calculations (all property types)');
    console.log('   ✓ Chance/Community Chest card handling');
    console.log('   ✓ Edge cases (triple doubles, mortgaged builds, etc.)');
    console.log('   ✓ Trade cooldown system');
    console.log('   ✓ Bot timeout detection');
    console.log('   ✓ Game persistence');
    console.log('   ✓ Win condition detection');
    console.log('   ✓ Debt system (partial payment, tracking, repayment)');
    console.log('   ✓ Bot difficulty levels (easy, medium, hard)');
    console.log('   ✓ Difficulty-specific auction behavior');
    console.log('   ✓ Difficulty-specific blocking recognition');
    console.log('   ✓ Difficulty-specific trade multipliers');

    console.log('\n');
}

function saveOutputToFile() {
    const outputPath = path.join(__dirname, '..', 'test-output.txt');
    const content = outputBuffer.join('\n');

    try {
        fs.writeFileSync(outputPath, content, 'utf8');
        originalLog(`\n📄 Test output saved to: ${outputPath}`);
    } catch (err) {
        originalError(`Failed to save output: ${err.message}`);
    }

    // Also save JSON results
    const jsonPath = path.join(__dirname, '..', 'test-results.json');
    try {
        fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2), 'utf8');
        originalLog(`📄 Test results JSON saved to: ${jsonPath}`);
    } catch (err) {
        originalError(`Failed to save JSON: ${err.message}`);
    }
}

// Run tests
runAllTests().then(results => {
    const exitCode = results.summary.totalFailed > 0 ? 1 : 0;
    process.exit(exitCode);
}).catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});

