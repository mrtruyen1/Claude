import { LightTile } from "./LightTile";
import { SwitchTile } from "./SwitchTile";
import { ClimateTile } from "./ClimateTile";
import { CoverTile } from "./CoverTile";
import { FanTile } from "./FanTile";
import { LockTile } from "./LockTile";
import { MediaPlayerTile } from "./MediaPlayerTile";
import { GenericTile } from "./GenericTile";
import type { TileProps } from "./tile-props";

export function renderTile(domain: string, props: TileProps) {
  switch (domain) {
    case "light":
      return <LightTile key={props.entityId} {...props} />;
    case "switch":
    case "input_boolean":
    case "humidifier":
      return <SwitchTile key={props.entityId} {...props} domain={domain} />;
    case "climate":
      return <ClimateTile key={props.entityId} {...props} />;
    case "cover":
      return <CoverTile key={props.entityId} {...props} />;
    case "fan":
      return <FanTile key={props.entityId} {...props} />;
    case "lock":
      return <LockTile key={props.entityId} {...props} />;
    case "media_player":
      return <MediaPlayerTile key={props.entityId} {...props} />;
    default:
      return <GenericTile key={props.entityId} {...props} domain={domain} />;
  }
}
