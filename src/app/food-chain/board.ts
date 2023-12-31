import * as PIXI from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import { Diner } from './diner';
import { playCashAnimation } from './diner.animations';
import { addDrinkToBoard, Drink, isDrink } from './drink';
import { addHouseToBoard, House, isHouse, satisfiesFood } from './house';
import { MarketingTile } from './marketingTile';
import { addRoadToBoard, isRoad, Road } from './road';
import { removeChildrenByName, Tile } from './tile';
import { renderToolbar } from './toolbar';
import { ts } from './utils/constants';
import {
  app,
  board,
  currentPlayer,
  keyEventMap,
  mainLayer,
} from './utils/singletons';
import {
  collides,
  findShortestRoadPath,
  rangeOverlapsItem,
} from './utils/utils';
import { addSpriteToBoard, travelPath } from './utils/graphics-utils';
import { drawPlacementIndicator, PlacementIndicatorColour } from './indicators';

export type BaseObject = {
  sprite?: PIXI.Sprite;
  container?: PIXI.Container;
};

export type BoardPosition = {
  i?: number;
  j?: number;
};

export type BoardItem = {
  name?: string;
  i?: number;
  j?: number;
  w: number;
  h: number;
  rotation?: number;
};

export type BoardObject = BaseObject & BoardItem;

export type Board = {
  chunksWide: number;
  chunksHigh: number;
  tiles: Tile[];
  outerTiles: Tile[];
  diners: Diner[];
  roads: Road[];
  houses: House[];
  drinks: Drink[];
  marketingTiles: MarketingTile[];
  container: PIXI.Container;
  deliverFood?: () => void;
};

export const getAdjacentRoads = (object: BoardItem): Road[] => {
  return board.roads.filter((road) => {
    return (
      collides(object, { ...road, i: road.i + 1 }) ||
      collides(object, { ...road, i: road.i - 1 }) ||
      collides(object, { ...road, j: road.j + 1 }) ||
      collides(object, { ...road, j: road.j - 1 })
    );
  });
};

export const getAdjacentDrinks = (object: Road) => {
  return board.drinks.filter((drink) => {
    return (
      collides(object, { ...drink, i: drink.i + 1 }) ||
      collides(object, { ...drink, i: drink.i - 1 }) ||
      collides(object, { ...drink, j: drink.j + 1 }) ||
      collides(object, { ...drink, j: drink.j - 1 })
    );
  });
};

export const rotateObject = (object: BoardObject) => {
  const width = object.w;
  const height = object.h;
  object.w = height;
  object.h = width;
  object.container.rotation += Math.PI / 2;
};

export const addObjectToBoard = (tile: Tile, boardObject: BoardObject) => {
  if (isHouse(boardObject)) {
    addHouseToBoard(boardObject);
  } else if (isRoad(boardObject)) {
    addRoadToBoard(boardObject);
  } else if (isDrink(boardObject)) {
    addDrinkToBoard(boardObject);
  }
  boardObject.i = tile.i;
  boardObject.j = tile.j;
  boardObject.container.x += boardObject.i * ts;
  boardObject.container.y += boardObject.j * ts;
  board.container.addChild(boardObject.container);
};

export const addBoardToStage = () => {
  board.container.pivot.x = board.container.width / 2;
  board.container.pivot.y = board.container.height / 2;
  board.container.position.x = app.screen.width / 2;
  board.container.position.y = app.screen.height / 2;
  board.container.sortableChildren = true;
  board.container.filters = [];
  app.stage.addChild(board.container);
};

export const enableDinnerTime = () => {
  board.diners.forEach((diner) => {
    diner.container.interactive = true;
    diner.container.buttonMode = true;
    diner.container.on('pointerdown', () => {
      dinnerTime();
    });
  });
};

export const chooseDiner = (diners: Diner[], house: House) => {
  const validDiners = diners.filter((diner) => satisfiesFood(diner, house));
  console.log(`found ${validDiners.length}`);
  if (validDiners.length === 0) return null;
  validDiners.forEach(
    (diner) =>
      (diner.housePath = findShortestRoadPath(board.roads, house, diner))
  );
  return validDiners.sort(
    (diner1, diner2) => diner1.housePath.length - diner2.housePath.length
  )[0];
};

export const feedHouse = async (diner: Diner, house: House) => {
  const player = diner.owner;
  const path = diner.housePath;
  if (path.length > 0) {
    let cashReward = 0;
    house.food.forEach((food) => {
      house.container.removeChild(food.sprite);
      player.food[food.kind.name].amount--;
      cashReward += 10;
    });
    player.cash += cashReward;
    house.food = [];
    const car = addSpriteToBoard('car', ts * 1.2);
    car.container.addChild(house.demandContainer);
    house.demandContainer.x -= 30;
    house.demandContainer.y -= 10;
    if (path.length > 1) {
      const firstRoad = path[0];
      await travelPath([firstRoad, firstRoad], car.container, car.sprite, 200);
      await travelPath(path, car.container, car.sprite, 20);
      playCashAnimation(diner, cashReward);
      renderToolbar(currentPlayer.player);
      car.container.removeChild(house.demandContainer);
      const lastRoad = path[path.length - 1];
      await travelPath([lastRoad, lastRoad], car.container, car.sprite, 100);
      path.reverse();
      await travelPath(path, car.container, car.sprite, 20);
      await travelPath([firstRoad, firstRoad], car.container, car.sprite, 100);
    } else if (path.length === 1) {
      await travelPath([path[0], path[0]], car.container, car.sprite, 200);
      playCashAnimation(diner, cashReward);
      renderToolbar(player);
      car.container.removeChild(house.demandContainer);
      await travelPath([path[0], path[0]], car.container, car.sprite, 200);
    }
    board.container.removeChild(car.container, car.sprite);
  }
};

export const dinnerTime = async () => {
  console.log('Dinner time activated');
  const housesWithDemand = board.houses.filter(
    (house) => house.food.length > 0
  );
  const sortedHouses = housesWithDemand.sort(
    (house1, house2) => house1.num - house2.num
  );
  for (let i = 0; i < sortedHouses.length; i++) {
    const house = sortedHouses[i];
    const diner = chooseDiner(board.diners, house);
    if (diner) {
      console.log(`Diner of player ${diner.owner.name} chosen`);
      house.sprite.filters = [
        new GlowFilter({ distance: 30, outerStrength: 2 }),
      ];
      diner.sprite.filters = [
        new GlowFilter({ distance: 30, outerStrength: 2 }),
      ];
      await feedHouse(diner, house);
      house.sprite.filters = [];
      diner.sprite.filters = [];
    } else {
      console.log(`No house diner suitable diner found for house ${house.num}`);
    }
  }
};

export const setRotation = (object: BoardObject) => {
  object.rotation += 0.5 * Math.PI;
  if (object.rotation === 2 * Math.PI) object.rotation = 0;

  const w = object.w;
  const h = object.h;

  object.h = w;
  object.w = h;
};

export const applyRotation = (object: BoardObject) => {
  object.sprite.rotation = object.rotation;
  object.sprite.x = (object.w * ts) / 2;
  object.sprite.y = (object.h * ts) / 2;
  console.log(object.rotation, object.w, object.h);
};

export const enablePlacement = (
  item: BoardObject,
  validTiles: Tile[],
  isValidPosition: (tile: Tile) => boolean,
  rangeFunction: (tile: Tile) => Tile[],
  callback?: () => void
) => {
  let invalidIndicator = drawPlacementIndicator(
    item.w,
    item.h,
    PlacementIndicatorColour.invalid
  );
  let validIndicator = drawPlacementIndicator(
    item.w,
    item.h,
    PlacementIndicatorColour.valid
  );

  let activeIndicator = validIndicator;

  keyEventMap.Space = () => {
    setRotation(item);
    invalidIndicator = drawPlacementIndicator(
      item.w,
      item.h,
      PlacementIndicatorColour.invalid
    );
    validIndicator = drawPlacementIndicator(
      item.w,
      item.h,
      PlacementIndicatorColour.valid
    );
    // TODO: Reset indicator when tile is rotated
    // removeChildrenByName(board.container, 'indicator');
    // board.container.addChild(activeIndicator);
  };

  validTiles.forEach((square) => {
    square.container.removeAllListeners();
    square.container.interactive = true;
    square.container.buttonMode = true;
    square.container.on('mouseover', () => {
      if (isValidPosition(square)) {
        activeIndicator = validIndicator;
      } else {
        activeIndicator = invalidIndicator;
      }
      activeIndicator.position.x = square.i * ts;
      activeIndicator.position.y = square.j * ts;
      removeChildrenByName(board.container, 'indicator');
      board.container.addChild(activeIndicator);

      const tilesInRange = rangeFunction(square);

      tilesInRange.forEach((_square) => {
        const tint = drawPlacementIndicator(
          1,
          1,
          PlacementIndicatorColour.range
        );
        tint.name = 'tint';
        _square.container.addChild(tint);
      });

      board.houses.forEach((house) => {
        house.sprite.tint = 0xffffff;
        if (rangeOverlapsItem(house, tilesInRange))
          house.sprite.tint = 0x5b6ee1;
      });
    });

    square.container.on('mouseout', () => {
      board.container.removeChild(activeIndicator);
      board.tiles.forEach((tile) =>
        removeChildrenByName(tile.container, 'tint')
      );
      board.houses.forEach((house) => {
        house.sprite.tint = 0xffffff;
      });
    });

    square.container.on('pointerdown', () => {
      console.log(square);
      if (isValidPosition(square)) {
        board.container.addChild(item.container);
        item.container.parentLayer = mainLayer;
        item.container.zOrder = 1;
        item.i = square.i;
        item.j = square.j;
        applyRotation(item);
        item.container.x = square.i * ts;
        item.container.y = square.j * ts;

        if (callback) callback();
      }
    });
  });
};

export const disablePlacement = () => {
  console.log('disabling placement');
  removeChildrenByName(board.container, 'indicator');
  [].concat(board.tiles, board.outerTiles).forEach((square) => {
    square.container.removeAllListeners();
    square.container.interactive = true;
    square.container.buttonMode = true;
  });
  [].concat(board.tiles, board.outerTiles).forEach((tile) => {
    removeChildrenByName(tile.container, 'tint');
  });
  board.houses.forEach((house) => (house.sprite.tint = 0xffffff));
  keyEventMap.Space = () => {
    return;
  };
};
