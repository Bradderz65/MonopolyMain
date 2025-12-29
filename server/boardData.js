/**
 * Monopoly Board Data
 * UK (London) themed board spaces
 * Uses consistent color naming convention (hyphenated for multi-word colors)
 */

const BOARD_SPACES = [
  { index: 0, name: 'GO', type: 'go' },
  { index: 1, name: 'Old Kent Road', type: 'property', color: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, mortgage: 30, owner: null, houses: 0, mortgaged: false },
  { index: 2, name: 'Community Chest', type: 'community-chest' },
  { index: 3, name: 'Whitechapel Road', type: 'property', color: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, mortgage: 30, owner: null, houses: 0, mortgaged: false },
  { index: 4, name: 'Income Tax', type: 'tax', amount: 200 },
  { index: 5, name: 'Kings Cross Station', type: 'railroad', price: 200, mortgage: 100, owner: null, mortgaged: false },
  { index: 6, name: 'The Angel Islington', type: 'property', color: 'light-blue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50, owner: null, houses: 0, mortgaged: false },
  { index: 7, name: 'Chance', type: 'chance' },
  { index: 8, name: 'Euston Road', type: 'property', color: 'light-blue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50, owner: null, houses: 0, mortgaged: false },
  { index: 9, name: 'Pentonville Road', type: 'property', color: 'light-blue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, mortgage: 60, owner: null, houses: 0, mortgaged: false },
  { index: 10, name: 'Jail / Just Visiting', type: 'jail' },
  { index: 11, name: 'Pall Mall', type: 'property', color: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70, owner: null, houses: 0, mortgaged: false },
  { index: 12, name: 'Electric Company', type: 'utility', price: 150, mortgage: 75, owner: null, mortgaged: false },
  { index: 13, name: 'Whitehall', type: 'property', color: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70, owner: null, houses: 0, mortgaged: false },
  { index: 14, name: 'Northumberland Avenue', type: 'property', color: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, mortgage: 80, owner: null, houses: 0, mortgaged: false },
  { index: 15, name: 'Marylebone Station', type: 'railroad', price: 200, mortgage: 100, owner: null, mortgaged: false },
  { index: 16, name: 'Bow Street', type: 'property', color: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90, owner: null, houses: 0, mortgaged: false },
  { index: 17, name: 'Community Chest', type: 'community-chest' },
  { index: 18, name: 'Marlborough Street', type: 'property', color: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90, owner: null, houses: 0, mortgaged: false },
  { index: 19, name: 'Vine Street', type: 'property', color: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, mortgage: 100, owner: null, houses: 0, mortgaged: false },
  { index: 20, name: 'Free Parking', type: 'free-parking' },
  { index: 21, name: 'Strand', type: 'property', color: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110, owner: null, houses: 0, mortgaged: false },
  { index: 22, name: 'Chance', type: 'chance' },
  { index: 23, name: 'Fleet Street', type: 'property', color: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110, owner: null, houses: 0, mortgaged: false },
  { index: 24, name: 'Trafalgar Square', type: 'property', color: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgage: 120, owner: null, houses: 0, mortgaged: false },
  { index: 25, name: 'Fenchurch St Station', type: 'railroad', price: 200, mortgage: 100, owner: null, mortgaged: false },
  { index: 26, name: 'Leicester Square', type: 'property', color: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130, owner: null, houses: 0, mortgaged: false },
  { index: 27, name: 'Coventry Street', type: 'property', color: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130, owner: null, houses: 0, mortgaged: false },
  { index: 28, name: 'Water Works', type: 'utility', price: 150, mortgage: 75, owner: null, mortgaged: false },
  { index: 29, name: 'Piccadilly', type: 'property', color: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, mortgage: 140, owner: null, houses: 0, mortgaged: false },
  { index: 30, name: 'Go To Jail', type: 'go-to-jail' },
  { index: 31, name: 'Regent Street', type: 'property', color: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150, owner: null, houses: 0, mortgaged: false },
  { index: 32, name: 'Oxford Street', type: 'property', color: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150, owner: null, houses: 0, mortgaged: false },
  { index: 33, name: 'Community Chest', type: 'community-chest' },
  { index: 34, name: 'Bond Street', type: 'property', color: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgage: 160, owner: null, houses: 0, mortgaged: false },
  { index: 35, name: 'Liverpool St Station', type: 'railroad', price: 200, mortgage: 100, owner: null, mortgaged: false },
  { index: 36, name: 'Chance', type: 'chance' },
  { index: 37, name: 'Park Lane', type: 'property', color: 'dark-blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, mortgage: 175, owner: null, houses: 0, mortgaged: false },
  { index: 38, name: 'Super Tax', type: 'tax', amount: 100 },
  { index: 39, name: 'Mayfair', type: 'property', color: 'dark-blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, mortgage: 200, owner: null, houses: 0, mortgaged: false }
];

const CHANCE_CARDS = [
  { text: 'Advance to GO. Collect £200.', action: 'move', destination: 0 },
  { text: 'Advance to Trafalgar Square. If you pass GO, collect £200.', action: 'move', destination: 24 },
  { text: 'Advance to Pall Mall. If you pass GO, collect £200.', action: 'move', destination: 11 },
  { text: 'Advance to nearest Utility. If unowned, you may buy it. If owned, pay owner 10x dice roll.', action: 'nearestUtility' },
  { text: 'Advance to nearest Station. Pay owner twice the rental.', action: 'nearestRailroad' },
  { text: 'Bank pays you dividend of £50.', action: 'money', amount: 50 },
  { text: 'Get Out of Jail Free.', action: 'jailCard' },
  { text: 'Go Back 3 Spaces.', action: 'moveBack', spaces: 3 },
  { text: 'Go to Jail. Do not pass GO, do not collect £200.', action: 'jail' },
  { text: 'Make general repairs on all your property. £25 per house, £100 per hotel.', action: 'repairs', houseCost: 25, hotelCost: 100 },
  { text: 'Pay school fees of £150.', action: 'money', amount: -150 },
  { text: 'Take a trip to Kings Cross Station. If you pass GO, collect £200.', action: 'move', destination: 5 },
  { text: 'Advance to Mayfair.', action: 'move', destination: 39 },
  { text: 'You have been elected Chairman of the Board. Pay each player £50.', action: 'moneyFromPlayers', amount: -50 },
  { text: 'Your building loan matures. Collect £150.', action: 'money', amount: 150 },
  { text: 'You have won a crossword competition. Collect £100.', action: 'money', amount: 100 }
];

const COMMUNITY_CHEST_CARDS = [
  { text: 'Advance to GO. Collect £200.', action: 'move', destination: 0 },
  { text: 'Bank error in your favour. Collect £200.', action: 'money', amount: 200 },
  { text: 'Doctor\'s fees. Pay £50.', action: 'money', amount: -50 },
  { text: 'From sale of stock you get £50.', action: 'money', amount: 50 },
  { text: 'Get Out of Jail Free.', action: 'jailCard' },
  { text: 'Go to Jail. Do not pass GO, do not collect £200.', action: 'jail' },
  { text: 'Grand Opera Night. Collect £50 from every player.', action: 'moneyFromPlayers', amount: 50 },
  { text: 'Holiday fund matures. Receive £100.', action: 'money', amount: 100 },
  { text: 'Income tax refund. Collect £20.', action: 'money', amount: 20 },
  { text: 'It is your birthday. Collect £10 from every player.', action: 'moneyFromPlayers', amount: 10 },
  { text: 'Life insurance matures. Collect £100.', action: 'money', amount: 100 },
  { text: 'Hospital fees. Pay £100.', action: 'money', amount: -100 },
  { text: 'School fees. Pay £50.', action: 'money', amount: -50 },
  { text: 'Receive £25 consultancy fee.', action: 'money', amount: 25 },
  { text: 'You are assessed for street repairs. £40 per house, £115 per hotel.', action: 'repairs', houseCost: 40, hotelCost: 115 },
  { text: 'You have won second prize in a beauty contest. Collect £10.', action: 'money', amount: 10 },
  { text: 'You inherit £100.', action: 'money', amount: 100 }
];

module.exports = { BOARD_SPACES, CHANCE_CARDS, COMMUNITY_CHEST_CARDS };
