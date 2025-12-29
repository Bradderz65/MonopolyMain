const { v4: uuidv4 } = require('uuid');
const { BOARD_SPACES, CHANCE_CARDS, COMMUNITY_CHEST_CARDS } = require('./boardData');

// Available player colors with names
const PLAYER_COLORS = [
  { id: 'red', hex: '#e74c3c', name: 'Red' },
  { id: 'blue', hex: '#3498db', name: 'Blue' },
  { id: 'green', hex: '#2ecc71', name: 'Green' },
  { id: 'yellow', hex: '#f1c40f', name: 'Yellow' },
  { id: 'purple', hex: '#9b59b6', name: 'Purple' },
  { id: 'teal', hex: '#1abc9c', name: 'Teal' },
  { id: 'orange', hex: '#e67e22', name: 'Orange' },
  { id: 'pink', hex: '#ff6b9d', name: 'Pink' }
];

// Available player tokens with names
const PLAYER_TOKENS = [
  { id: 'car', emoji: '🚗', name: 'Car' },
  { id: 'hat', emoji: '🎩', name: 'Top Hat' },
  { id: 'shoe', emoji: '👟', name: 'Shoe' },
  { id: 'ship', emoji: '🚢', name: 'Ship' },
  { id: 'dog', emoji: '🐕', name: 'Dog' },
  { id: 'cat', emoji: '🐈', name: 'Cat' },
  { id: 'thimble', emoji: '🧵', name: 'Thimble' },
  { id: 'diamond', emoji: '💎', name: 'Diamond' }
];

class Game {
  constructor(id, name, maxPlayers = 4, isPrivate = false, auctionsEnabled = false) {
    this.id = id;
    this.name = name;
    this.maxPlayers = Math.min(maxPlayers, 8);
    this.isPrivate = isPrivate;
    this.auctionsEnabled = auctionsEnabled;
    this.players = [];
    this.started = false;
    this.currentPlayerIndex = 0;
    this.board = JSON.parse(JSON.stringify(BOARD_SPACES));
    this.chanceCards = this.shuffleArray([...CHANCE_CARDS]);
    this.communityChestCards = this.shuffleArray([...COMMUNITY_CHEST_CARDS]);
    this.chanceIndex = 0;
    this.communityChestIndex = 0;
    this.diceRolled = false;
    this.lastDiceRoll = null;
    this.canRollAgain = false;
    this.doublesCount = 0;
    this.pendingAction = null;
    this.auction = null;
    this.trades = [];
    this.gameLog = [];
    this.freeParking = 0;
    this.housesAvailable = 32;
    this.hotelsAvailable = 12;
    this.turnStartTime = Date.now();
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  addPlayer(socketId, name, tokenId = null, colorId = null) {
    if (this.players.length >= this.maxPlayers) return null;

    // Get used tokens and colors
    const usedTokens = this.players.map(p => p.tokenId);
    const usedColors = this.players.map(p => p.colorId);

    // Find available token (use specified or first available)
    let selectedToken;
    if (tokenId && !usedTokens.includes(tokenId)) {
      selectedToken = PLAYER_TOKENS.find(t => t.id === tokenId);
    }
    if (!selectedToken) {
      selectedToken = PLAYER_TOKENS.find(t => !usedTokens.includes(t.id)) || PLAYER_TOKENS[0];
    }

    // Find available color (use specified or first available)
    let selectedColor;
    if (colorId && !usedColors.includes(colorId)) {
      selectedColor = PLAYER_COLORS.find(c => c.id === colorId);
    }
    if (!selectedColor) {
      selectedColor = PLAYER_COLORS.find(c => !usedColors.includes(c.id)) || PLAYER_COLORS[0];
    }

    const player = {
      id: socketId,
      name: name,
      money: 1500,
      position: 0,
      properties: [],
      inJail: false,
      jailTurns: 0,
      getOutOfJailCards: 0,
      bankrupt: false,
      disconnected: false,
      isBot: false,
      color: selectedColor.hex,
      colorId: selectedColor.id,
      colorName: selectedColor.name,
      token: selectedToken.emoji,
      tokenId: selectedToken.id,
      tokenName: selectedToken.name,
      isHost: this.players.length === 0
    };

    this.players.push(player);
    this.addLog(`${name} joined the game as ${selectedToken.emoji}`);
    return player;
  }

  // Get available tokens not in use
  getAvailableTokens() {
    const usedTokens = this.players.map(p => p.tokenId);
    return PLAYER_TOKENS.filter(t => !usedTokens.includes(t.id));
  }

  // Get available colors not in use
  getAvailableColors() {
    const usedColors = this.players.map(p => p.colorId);
    return PLAYER_COLORS.filter(c => !usedColors.includes(c.id));
  }

  // Static getters for all options
  static getAllTokens() {
    return PLAYER_TOKENS;
  }

  static getAllColors() {
    return PLAYER_COLORS;
  }

  removePlayer(socketId, forceRemove = false) {
    const index = this.players.findIndex(p => p.id === socketId);
    if (index === -1) return null;

    const player = this.players[index];
    this.addLog(`${player.name} left the game`);

    // Reset all properties owned by this player
    this.board.forEach(space => {
      if (space.owner === socketId) {
        space.owner = null;
        space.mortgaged = false;
        // Return houses to bank
        if (space.houses) {
          if (space.houses === 5) {
            this.hotelsAvailable++;
            this.housesAvailable += 4; // Hotel = 4 houses worth
          } else {
            this.housesAvailable += space.houses;
          }
          space.houses = 0;
        }
      }
    });

    if (!this.started || forceRemove) {
      // Before game starts or forced - completely remove player
      this.players.splice(index, 1);

      // Assign new host if needed
      if (this.players.length > 0 && index === 0) {
        this.players[0].isHost = true;
      }
    } else {
      // During game - mark as bankrupt and remove from active play
      player.bankrupt = true;
      player.disconnected = true;
      player.money = 0;
      player.properties = [];

      // If it was this player's turn, advance to next player
      if (this.currentPlayerIndex === index) {
        this.endTurn();
      } else if (this.currentPlayerIndex > index) {
        // Adjust current player index if we removed someone before them
        // (not needed if we keep player in array as bankrupt)
      }
    }

    // Check for winner after removal
    const activePlayers = this.players.filter(p => !p.bankrupt);
    if (this.started && activePlayers.length === 1) {
      // Only one player left - they win
      return { removed: player, winner: activePlayers[0] };
    }

    return { removed: player };
  }

  getPlayer(socketId) {
    return this.players.find(p => p.id === socketId);
  }

  setPlayerDisconnected(socketId) {
    const player = this.getPlayer(socketId);
    if (player) {
      player.disconnected = true;
      this.addLog(`${player.name} disconnected`);
    }
  }

  rejoinPlayer(oldSocketId, newSocketId, playerName = null) {
    let player;

    // First try to find by name (more reliable)
    if (playerName) {
      player = this.players.find(p => p.name === playerName);
    }

    // Fallback: find by old socket ID
    if (!player) {
      player = this.players.find(p => p.id === oldSocketId);
    }

    // Last resort: find any disconnected player
    if (!player) {
      player = this.players.find(p => p.disconnected);
    }

    if (player) {
      const oldId = player.id;
      player.id = newSocketId;
      player.disconnected = false;

      // Update property ownership to use new socket ID
      this.board.forEach(space => {
        if (space.owner === oldId) {
          space.owner = newSocketId;
        }
      });

      this.addLog(`${player.name} reconnected`);
      return true;
    }
    return false;
  }

  start() {
    this.started = true;
    this.shuffleArray(this.players);
    this.players[0].isHost = true;
    this.addLog('Game started!');
    this.turnStartTime = Date.now();
    this.addLog(`${this.players[0].name}'s turn`);
  }

  rollDice() {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;
    const isDoubles = die1 === die2;

    this.lastDiceRoll = { die1, die2, total, isDoubles };
    this.diceRolled = true;

    const player = this.players[this.currentPlayerIndex];
    this.addLog(`${player.name} rolled ${die1} + ${die2} = ${total}${isDoubles ? ' (doubles!)' : ''}`);

    if (isDoubles) {
      this.doublesCount++;
      if (this.doublesCount >= 3) {
        this.sendToJail(player);
        this.canRollAgain = false;
        return this.lastDiceRoll;
      }
      this.canRollAgain = true;
    } else {
      this.canRollAgain = false;
      this.doublesCount = 0;
    }

    if (player.inJail) {
      if (isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(`${player.name} rolled doubles and is released from jail!`);
        // Move to Just Visiting (position 10) then move by dice roll
        this.movePlayer(player, total);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          // After 3 failed attempts, must pay fine
          player.money -= 50;
          player.inJail = false;
          player.jailTurns = 0;
          this.addLog(`${player.name} paid £50 after 3 failed attempts and is released from jail`);
          this.movePlayer(player, total);
        } else {
          this.addLog(`${player.name} failed to roll doubles (attempt ${player.jailTurns}/3)`);
          this.canRollAgain = false;
        }
      }
    } else {
      this.movePlayer(player, total);
    }

    return this.lastDiceRoll;
  }

  movePlayer(player, spaces) {
    const oldPosition = player.position;
    player.position = (player.position + spaces) % 40;

    if (player.position < oldPosition && spaces > 0) {
      player.money += 200;
      this.addLog(`${player.name} passed GO and collected £200`);
    }
  }

  movePlayerTo(player, position, collectGo = true) {
    if (collectGo && position < player.position && position !== 10) {
      player.money += 200;
      this.addLog(`${player.name} passed GO and collected £200`);
    }
    player.position = position;
  }

  handleLanding() {
    const player = this.players[this.currentPlayerIndex];
    const space = this.board[player.position];

    this.addLog(`${player.name} landed on ${space.name}`);

    let result = { type: 'landed', space: space };

    switch (space.type) {
      case 'property':
      case 'railroad':
      case 'utility':
        if (space.owner === null) {
          this.pendingAction = { type: 'buyOrAuction', property: space };
          result.action = 'buyOrAuction';
          result.price = space.price;
        } else if (space.owner !== player.id && !space.mortgaged) {
          const rent = this.calculateRent(space, player);
          this.payRent(player, space, rent);
          result.action = 'paidRent';
          result.rent = rent;
          result.position = player.position;
        }
        break;

      case 'tax':
        player.money -= space.amount;
        this.freeParking += space.amount;
        this.addLog(`${player.name} paid £${space.amount} in ${space.name}`);
        result.action = 'paidTax';
        result.amount = space.amount;
        break;

      case 'chance':
        result = this.drawChanceCard(player);
        break;

      case 'community-chest':
        result = this.drawCommunityChestCard(player);
        break;

      case 'go-to-jail':
        this.sendToJail(player);
        result.action = 'goToJail';
        break;

      case 'free-parking':
        if (this.freeParking > 0) {
          player.money += this.freeParking;
          this.addLog(`${player.name} collected £${this.freeParking} from Free Parking`);
          result.action = 'freeParking';
          result.amount = this.freeParking;
          this.freeParking = 0;
        }
        break;

      case 'jail':
        result.action = 'justVisiting';
        break;

      case 'go':
        break;
    }

    this.checkBankruptcy(player);
    return result;
  }

  calculateRent(space, landingPlayer) {
    const owner = this.players.find(p => p.id === space.owner);
    if (!owner || space.mortgaged) return 0;

    if (space.type === 'railroad') {
      const railroadsOwned = this.board.filter(s => s.type === 'railroad' && s.owner === owner.id).length;
      return 25 * Math.pow(2, railroadsOwned - 1);
    }

    if (space.type === 'utility') {
      const utilitiesOwned = this.board.filter(s => s.type === 'utility' && s.owner === owner.id).length;
      const multiplier = utilitiesOwned === 2 ? 10 : 4;
      return this.lastDiceRoll.total * multiplier;
    }

    if (space.houses === 5) {
      return space.rent[5];
    }

    if (space.houses > 0) {
      return space.rent[space.houses];
    }

    const colorGroup = this.board.filter(s => s.color === space.color);
    const ownsAll = colorGroup.every(s => s.owner === owner.id);

    return ownsAll ? space.rent[0] * 2 : space.rent[0];
  }

  payRent(player, space, rent) {
    const owner = this.players.find(p => p.id === space.owner);
    if (!owner) {
      // Owner not found (possibly disconnected) - skip rent payment
      this.addLog(`${player.name} landed on ${space.name} but owner is unavailable`);
      return;
    }
    player.money -= rent;
    owner.money += rent;
    this.addLog(`${player.name} paid £${rent} rent to ${owner.name}`);
  }

  drawChanceCard(player) {
    const card = this.chanceCards[this.chanceIndex];
    this.chanceIndex = (this.chanceIndex + 1) % this.chanceCards.length;

    if (this.chanceIndex === 0) {
      this.chanceCards = this.shuffleArray([...this.chanceCards]);
    }

    this.addLog(`${player.name} drew Chance: "${card.text}"`);
    return this.executeCard(player, card, 'chance');
  }

  drawCommunityChestCard(player) {
    const card = this.communityChestCards[this.communityChestIndex];
    this.communityChestIndex = (this.communityChestIndex + 1) % this.communityChestCards.length;

    if (this.communityChestIndex === 0) {
      this.communityChestCards = this.shuffleArray([...this.communityChestCards]);
    }

    this.addLog(`${player.name} drew Community Chest: "${card.text}"`);
    return this.executeCard(player, card, 'community-chest');
  }

  executeCard(player, card, cardType) {
    const result = { type: cardType, card: card };

    switch (card.action) {
      case 'move':
        this.movePlayerTo(player, card.destination, true);
        const landResult = this.handleLanding();
        result.landed = landResult;
        break;

      case 'moveBack':
        player.position = (player.position - card.spaces + 40) % 40;
        this.addLog(`${player.name} moved back ${card.spaces} spaces`);
        const backResult = this.handleLanding();
        result.landed = backResult;
        break;

      case 'money':
        player.money += card.amount;
        if (card.amount > 0) {
          this.addLog(`${player.name} received £${card.amount}`);
        } else {
          this.addLog(`${player.name} paid £${Math.abs(card.amount)}`);
          this.freeParking += Math.abs(card.amount);
        }
        break;

      case 'moneyFromPlayers':
        const otherPlayers = this.players.filter(p => p.id !== player.id && !p.bankrupt);
        otherPlayers.forEach(p => {
          p.money -= card.amount;
          player.money += card.amount;
        });
        this.addLog(`${player.name} collected £${card.amount} from each player`);
        break;

      case 'jail':
        this.sendToJail(player);
        break;

      case 'jailCard':
        player.getOutOfJailCards++;
        this.addLog(`${player.name} received a Get Out of Jail Free card`);
        break;

      case 'repairs':
        let repairCost = 0;
        player.properties.forEach(propIndex => {
          const prop = this.board[propIndex];
          if (prop.houses === 5) {
            repairCost += card.hotelCost;
          } else if (prop.houses > 0) {
            repairCost += prop.houses * card.houseCost;
          }
        });
        player.money -= repairCost;
        this.freeParking += repairCost;
        this.addLog(`${player.name} paid £${repairCost} for repairs`);
        result.repairCost = repairCost;
        break;

      case 'nearestRailroad':
        const railroads = [5, 15, 25, 35];
        let nearest = railroads.find(r => r > player.position) || railroads[0];
        this.movePlayerTo(player, nearest, true);
        const railSpace = this.board[nearest];
        if (railSpace.owner && railSpace.owner !== player.id) {
          const rent = this.calculateRent(railSpace, player) * 2;
          this.payRent(player, railSpace, rent);
        }
        break;

      case 'nearestUtility':
        const utilities = [12, 28];
        let nearestUtil = utilities.find(u => u > player.position) || utilities[0];
        this.movePlayerTo(player, nearestUtil, true);
        const utilSpace = this.board[nearestUtil];
        if (utilSpace.owner && utilSpace.owner !== player.id) {
          const rent = this.lastDiceRoll.total * 10;
          this.payRent(player, utilSpace, rent);
        }
        break;
    }

    this.checkBankruptcy(player);
    return result;
  }

  sendToJail(player) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    this.canRollAgain = false;
    this.doublesCount = 0;
    this.addLog(`${player.name} was sent to jail`);
  }

  payJailFine(player) {
    if (!player.inJail) {
      return { success: false, message: 'Not in jail' };
    }
    if (player.money < 50) {
      return { success: false, message: 'Not enough money' };
    }
    player.money -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    this.diceRolled = false;  // Allow player to roll after paying
    this.addLog(`${player.name} paid £50 to get out of jail`);
    return { success: true };
  }

  useJailCard(player) {
    if (!player.inJail) {
      return { success: false, message: 'Not in jail' };
    }
    if (player.getOutOfJailCards < 1) {
      return { success: false, message: 'No Get Out of Jail Free cards' };
    }
    player.getOutOfJailCards--;
    player.inJail = false;
    player.jailTurns = 0;
    this.diceRolled = false;  // Allow player to roll after using card
    this.addLog(`${player.name} used a Get Out of Jail Free card`);
    return { success: true };
  }

  buyProperty() {
    if (!this.pendingAction || this.pendingAction.type !== 'buyOrAuction') {
      return { success: false, message: 'No property to buy' };
    }

    const player = this.players[this.currentPlayerIndex];
    const property = this.pendingAction.property;

    if (player.money < property.price) {
      return { success: false, message: 'Not enough money' };
    }

    player.money -= property.price;
    property.owner = player.id;
    player.properties.push(this.board.indexOf(property));
    this.pendingAction = null;

    this.addLog(`${player.name} bought ${property.name} for £${property.price}`);
    return { success: true, property: property };
  }

  startAuction() {
    if (!this.pendingAction || this.pendingAction.type !== 'buyOrAuction') return;

    const property = this.pendingAction.property;
    const currentPlayerId = this.players[this.currentPlayerIndex].id;

    // All non-bankrupt players can participate
    const allParticipants = this.players.filter(p => !p.bankrupt).map(p => p.id);

    this.auction = {
      property: property,
      propertyIndex: this.board.indexOf(property),
      currentBid: 0,
      minimumBid: 10, // Minimum starting bid
      highestBidder: null,
      participants: allParticipants,
      passedPlayers: [currentPlayerId], // Current player already passed by declining to buy
      autoComplete: true // Flag to auto-complete if no one bids
    };
    this.pendingAction = null;
    this.addLog(`Auction started for ${property.name} (minimum bid: £10)`);
  }

  placeBid(player, amount) {
    if (!this.auction) return { success: false };
    if (!this.auction.participants.includes(player.id)) return { success: false };

    // Check minimum bid
    const minRequired = Math.max(this.auction.minimumBid || 10, this.auction.currentBid + 1);
    if (amount < minRequired) return { success: false, message: `Minimum bid is £${minRequired}` };
    if (amount > player.money) return { success: false, message: 'Not enough money' };

    this.auction.currentBid = amount;
    this.auction.highestBidder = player.id;
    this.addLog(`${player.name} bid £${amount}`);

    return { success: true };
  }

  passBid(player) {
    if (!this.auction) return;
    if (this.auction.passedPlayers.includes(player.id)) return;

    this.auction.passedPlayers.push(player.id);
    this.addLog(`${player.name} passed on the auction`);

    const remainingBidders = this.auction.participants.filter(
      id => !this.auction.passedPlayers.includes(id)
    );

    if (remainingBidders.length <= 1 && this.auction.highestBidder) {
      this.completeAuction();
    } else if (remainingBidders.length === 0) {
      this.addLog(`No one bought ${this.auction.property.name}`);
      this.auction = null;
    }
  }

  completeAuction() {
    if (!this.auction || !this.auction.highestBidder) return;

    const winner = this.players.find(p => p.id === this.auction.highestBidder);
    const property = this.auction.property;

    winner.money -= this.auction.currentBid;
    property.owner = winner.id;
    winner.properties.push(this.auction.propertyIndex);

    this.addLog(`${winner.name} won the auction for ${property.name} at £${this.auction.currentBid}`);
    this.auction = null;
  }

  buildHouse(player, propertyIndex) {
    const property = this.board[propertyIndex];

    if (!property || property.owner !== player.id) {
      return { success: false, message: 'You don\'t own this property' };
    }
    if (property.type !== 'property') {
      return { success: false, message: 'Cannot build on this property type' };
    }
    if (property.mortgaged) {
      return { success: false, message: 'Property is mortgaged' };
    }

    const colorGroup = this.board.filter(s => s.color === property.color);
    const ownsAll = colorGroup.every(s => s.owner === player.id);

    if (!ownsAll) {
      return { success: false, message: 'Must own all properties in color group' };
    }

    const minHouses = Math.min(...colorGroup.map(s => s.houses));
    if (property.houses > minHouses) {
      return { success: false, message: 'Must build evenly' };
    }

    if (property.houses >= 5) {
      return { success: false, message: 'Maximum buildings reached' };
    }

    const isHotel = property.houses === 4;
    if (isHotel && this.hotelsAvailable < 1) {
      return { success: false, message: 'No hotels available' };
    }
    if (!isHotel && this.housesAvailable < 1) {
      return { success: false, message: 'No houses available' };
    }

    if (player.money < property.houseCost) {
      return { success: false, message: 'Not enough money' };
    }

    player.money -= property.houseCost;
    property.houses++;

    if (isHotel) {
      this.housesAvailable += 4;
      this.hotelsAvailable--;
      this.addLog(`${player.name} built a hotel on ${property.name}`);
    } else {
      this.housesAvailable--;
      this.addLog(`${player.name} built a house on ${property.name}`);
    }

    return { success: true, property: property };
  }

  sellHouse(player, propertyIndex) {
    const property = this.board[propertyIndex];

    if (!property || property.owner !== player.id) {
      return { success: false, message: 'You don\'t own this property' };
    }
    if (property.houses < 1) {
      return { success: false, message: 'No buildings to sell' };
    }

    const colorGroup = this.board.filter(s => s.color === property.color);
    const maxHouses = Math.max(...colorGroup.map(s => s.houses));
    if (property.houses < maxHouses) {
      return { success: false, message: 'Must sell evenly' };
    }

    const isHotel = property.houses === 5;
    if (isHotel && this.housesAvailable < 4) {
      return { success: false, message: 'Not enough houses to downgrade hotel' };
    }

    player.money += property.houseCost / 2;
    property.houses--;

    if (isHotel) {
      this.housesAvailable -= 4;
      this.hotelsAvailable++;
      this.addLog(`${player.name} sold a hotel on ${property.name}`);
    } else {
      this.housesAvailable++;
      this.addLog(`${player.name} sold a house on ${property.name}`);
    }

    this.checkBankruptcy(player);
    return { success: true, property: property };
  }

  mortgageProperty(player, propertyIndex) {
    const property = this.board[propertyIndex];

    if (!property || property.owner !== player.id) {
      return { success: false, message: 'You don\'t own this property' };
    }
    if (property.mortgaged) {
      return { success: false, message: 'Already mortgaged' };
    }
    if (property.houses > 0) {
      return { success: false, message: 'Must sell all buildings first' };
    }

    property.mortgaged = true;
    player.money += property.mortgage;

    this.addLog(`${player.name} mortgaged ${property.name} for £${property.mortgage}`);
    this.checkBankruptcy(player);
    return { success: true, property: property };
  }

  unmortgageProperty(player, propertyIndex) {
    const property = this.board[propertyIndex];

    if (!property || property.owner !== player.id) {
      return { success: false, message: 'You don\'t own this property' };
    }
    if (!property.mortgaged) {
      return { success: false, message: 'Not mortgaged' };
    }

    const cost = Math.floor(property.mortgage * 1.1);
    if (player.money < cost) {
      return { success: false, message: 'Not enough money' };
    }

    property.mortgaged = false;
    player.money -= cost;

    this.addLog(`${player.name} unmortgaged ${property.name} for £${cost}`);
    return { success: true, property: property };
  }

  proposeTrade(fromPlayer, toPlayerId, offer, request) {
    const toPlayer = this.players.find(p => p.id === toPlayerId);
    if (!toPlayer) return null;

    const trade = {
      id: uuidv4(),
      from: fromPlayer.id,
      to: toPlayerId,
      offer: offer,
      request: request,
      status: 'pending'
    };

    this.trades.push(trade);
    this.addLog(`${fromPlayer.name} proposed a trade to ${toPlayer.name}`);
    return trade;
  }

  acceptTrade(tradeId, player) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade || trade.to !== player.id) {
      return { success: false, message: 'Invalid trade' };
    }

    const fromPlayer = this.players.find(p => p.id === trade.from);
    const toPlayer = player;

    if (trade.offer.money && fromPlayer.money < trade.offer.money) {
      return { success: false, message: 'Offering player doesn\'t have enough money' };
    }
    if (trade.request.money && toPlayer.money < trade.request.money) {
      return { success: false, message: 'You don\'t have enough money' };
    }

    if (trade.offer.money) {
      fromPlayer.money -= trade.offer.money;
      toPlayer.money += trade.offer.money;
    }
    if (trade.request.money) {
      toPlayer.money -= trade.request.money;
      fromPlayer.money += trade.request.money;
    }

    if (trade.offer.properties) {
      trade.offer.properties.forEach(propIndex => {
        const prop = this.board[propIndex];
        prop.owner = toPlayer.id;
        fromPlayer.properties = fromPlayer.properties.filter(p => p !== propIndex);
        toPlayer.properties.push(propIndex);
      });
    }

    if (trade.request.properties) {
      trade.request.properties.forEach(propIndex => {
        const prop = this.board[propIndex];
        prop.owner = fromPlayer.id;
        toPlayer.properties = toPlayer.properties.filter(p => p !== propIndex);
        fromPlayer.properties.push(propIndex);
      });
    }

    trade.status = 'accepted';
    this.addLog(`${toPlayer.name} accepted trade from ${fromPlayer.name}`);
    return { success: true, trade: trade };
  }

  declineTrade(tradeId) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (trade) {
      trade.status = 'declined';
    }
  }

  checkBankruptcy(player) {
    if (player.money < 0) {
      const totalAssets = this.calculateTotalAssets(player);
      if (totalAssets < Math.abs(player.money)) {
        this.pendingAction = { type: 'mustPayOrBankrupt', amount: Math.abs(player.money) };
      } else {
        this.pendingAction = { type: 'mustRaiseFunds', amount: Math.abs(player.money) };
      }
    } else if (this.pendingAction && (this.pendingAction.type === 'mustRaiseFunds' || this.pendingAction.type === 'mustPayOrBankrupt')) {
      // Player is solvent again
      this.pendingAction = null;
    }
  }

  calculateTotalAssets(player) {
    let total = player.money;
    player.properties.forEach(propIndex => {
      const prop = this.board[propIndex];
      if (!prop.mortgaged) {
        total += prop.mortgage;
      }
      if (prop.houses) {
        total += (prop.houses * prop.houseCost) / 2;
      }
    });
    return total;
  }

  declareBankruptcy(player) {
    player.bankrupt = true;
    this.addLog(`${player.name} declared bankruptcy`);

    player.properties.forEach(propIndex => {
      const prop = this.board[propIndex];
      prop.owner = null;
      prop.houses = 0;
      prop.mortgaged = false;
    });
    player.properties = [];
    player.money = 0;

    if (this.currentPlayerIndex === this.players.indexOf(player)) {
      this.endTurn();
    }

    return { player: player };
  }

  checkWinner() {
    const activePlayers = this.players.filter(p => !p.bankrupt);
    return activePlayers.length === 1;
  }

  getWinner() {
    const activePlayers = this.players.filter(p => !p.bankrupt);
    return activePlayers.length === 1 ? activePlayers[0] : null;
  }

  endTurn() {
    this.diceRolled = false;
    this.canRollAgain = false;
    this.doublesCount = 0;
    this.pendingAction = null;

    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].bankrupt);

    const nextPlayer = this.players[this.currentPlayerIndex];
    this.turnStartTime = Date.now();
    this.addLog(`${nextPlayer.name}'s turn`);
  }

  checkBotTimeout() {
    if (!this.started) return null;

    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || !currentPlayer.isBot) return null;

    // 30 second timeout for bots
    if (Date.now() - this.turnStartTime > 30000) {
      this.addLog(`Bot ${currentPlayer.name} timed out - skipping turn`);

      // Force end turn logic
      this.diceRolled = false;
      this.canRollAgain = false;
      this.pendingAction = null;
      this.auction = null;

      this.endTurn();
      return { skipped: true, game: this.getState() };
    }
    return null;
  }

  addLog(message) {
    this.gameLog.push({
      time: new Date().toISOString(),
      message: message
    });
    if (this.gameLog.length > 100) {
      this.gameLog.shift();
    }
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      started: this.started,
      players: this.players.map(p => ({
        ...p,
        properties: p.properties.map(idx => ({
          index: idx,
          ...this.board[idx]
        }))
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      board: this.board,
      diceRolled: this.diceRolled,
      lastDiceRoll: this.lastDiceRoll,
      canRollAgain: this.canRollAgain,
      pendingAction: this.pendingAction,
      auction: this.auction,
      trades: this.trades.filter(t => t.status === 'pending'),
      gameLog: this.gameLog.slice(-20),
      freeParking: this.freeParking,
      housesAvailable: this.housesAvailable,
      hotelsAvailable: this.hotelsAvailable
    };
  }
}

module.exports = { Game, PLAYER_TOKENS, PLAYER_COLORS };
