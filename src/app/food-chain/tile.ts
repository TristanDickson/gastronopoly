import * as PIXI from 'pixi.js';
import { Board, BoardObject } from './board';
import { parseDrinkConfig } from './drink';
import { foodKinds } from './food';
import { parseHouseConfig } from './house';
import { parseRoadConfig } from './road';
import { lineColour } from './types';
import { tileConfigRegex, ts } from './utils/constants';
import { createSprite } from './utils/graphics-utils';
import { app, board, mainLayer } from './utils/singletons';
import { calcDistance } from './utils/utils';

export type TileConfig = Array<Array<string | Array<string>>>;

export type Tile = {
  i?: number;
  j?: number;
  w: number;
  h: number;
  toGoal?: number;
  fromStart?: number;
  previousTile?: Tile;
  occupants?: BoardObject[];
  container?: PIXI.Container;
  sprite?: PIXI.Sprite;
};

export type Chunk = Tile[];

export const generateTileTexture = (fillColor: number, alpha = 1) => {
  const square = new PIXI.Graphics();
  square.lineStyle(2, lineColour, alpha);
  //square.beginFill(fillColor, alpha);
  square.drawRect(2, 2, ts - 2, ts - 2);
  square.endFill();

  const renderContainer = new PIXI.Container();
  renderContainer.addChild(square);

  const baseTexture = new PIXI.BaseRenderTexture({
    width: ts,
    height: ts,
  });
  const renderTexture = new PIXI.RenderTexture(baseTexture);

  app.renderer.render(renderContainer, { renderTexture });

  return renderTexture;
};
const outerTileTexture = generateTileTexture(0xc8c1be, 0);

export const parseTileContents = (contents: string, zOffset = 0) => {
  const match = tileConfigRegex.exec(contents);

  if (match[1] === 'r') {
    return parseRoadConfig(match, zOffset);
  } else if (match[1] === 'h') {
    return parseHouseConfig(match);
  } else if (
    Object.values(foodKinds)
      .map((kind) => kind.letter)
      .includes(match[1])
  )
    return parseDrinkConfig(match, zOffset);
  else {
    console.log(`${match[1]} not matched`);
  }

  return null;
};

export const parseTileConfig = (tileConfig: TileConfig): Chunk => {
  const tileArray: Tile[] = [];
  tileConfig.forEach((row, j) =>
    row.forEach((element, i) => {
      const tile: Tile = {
        i: i,
        j: j,
        w: 1,
        h: 1,
        occupants: [],
      };

      if (typeof element === 'string') {
        if (element !== 'e') tile.occupants.push(parseTileContents(element));
      } else
        element.forEach((subElement, i) =>
          tile.occupants.push(parseTileContents(subElement, i * 2))
        );
      tileArray.push(tile);
    })
  );
  return tileArray;
};

export const addOuterTileToBoard = (board: Board, i: number, j: number) => {
  const tile: Tile = {
    i: i,
    j: j,
    w: 1,
    h: 1,
  };
  const squareSprite = new PIXI.Sprite(outerTileTexture);
  tile.container = new PIXI.Container();
  tile.container.parentLayer = mainLayer;
  tile.container.zOrder = 0;
  tile.container.position.x = tile.i * ts;
  tile.container.position.y = tile.j * ts;
  tile.container.addChild(squareSprite);

  board.outerTiles.push(tile);
  board.container.addChild(tile.container);
};

export const addTileToBoard = (
  tile: Tile,
  iOffset: number,
  jOffset: number
) => {
  const squareSprite = createSprite('grass', ts - 4);
  tile.sprite = squareSprite;
  tile.container = new PIXI.Container();
  tile.i += iOffset;
  tile.j += jOffset;
  tile.container.x = tile.i * ts;
  tile.container.y = tile.j * ts;
  tile.container.parentLayer = mainLayer;
  tile.container.zOrder = 0;
  tile.container.addChild(squareSprite);

  board.tiles.push(tile);
  board.container.addChild(tile.container);
};

export const getAdjacentSquares = (tiles: Tile[], tile1: Tile) => {
  return tiles.filter((tile2) => calcDistance(tile1, tile2) === 1);
};

export const removeChildrenByName = (
  object: PIXI.Container,
  childName: string
) => {
  let tint = object.getChildByName(childName);
  while (tint) {
    tint.destroy();
    tint = object.getChildByName(childName);
  }
};
