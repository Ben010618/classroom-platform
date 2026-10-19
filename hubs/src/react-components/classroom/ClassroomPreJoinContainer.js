import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { ClassroomPreJoin } from "./ClassroomPreJoin";
import { isLiteMode, setLiteMode } from "../../classroom/lite-mode";
import { getScreenResolutionWidth, getScreenResolutionHeight } from "../../utils/screen-orientation-utils";

const RELOAD_DELAY_MS = 800;

export function ClassroomPreJoinContainer({ store }) {
  const [liteMode, setLite] = useState(() => isLiteMode(store.state.preferences));
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onChange = () => setLite(isLiteMode(store.state.preferences));
    store.addEventListener("statechanged", onChange);
    return () => store.removeEventListener("statechanged", onChange);
  }, [store]);

  return (
    <ClassroomPreJoin
      liteMode={liteMode}
      reloading={reloading}
      onLiteModeChange={on => {
        const needsReload = setLiteMode(store, on, {
          width: getScreenResolutionWidth(),
          height: getScreenResolutionHeight()
        });
        if (needsReload) {
          setReloading(true);
          setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
        }
      }}
    />
  );
}

ClassroomPreJoinContainer.propTypes = {
  store: PropTypes.object.isRequired
};
