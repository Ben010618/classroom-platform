import React from "react";
import PropTypes from "prop-types";
import { FormattedMessage } from "react-intl";
import { ToggleInput } from "../input/ToggleInput";
import styles from "./ClassroomPreJoin.scss";

export function ClassroomPreJoin({ liteMode, reloading, onLiteModeChange }) {
  return (
    <div className={styles.preJoin}>
      <div className={styles.rules}>
        <h5 className={styles.heading}>
          <FormattedMessage id="classroom-prejoin.rules.heading" defaultMessage="Class rules" />
        </h5>
        <ul>
          <li>
            <FormattedMessage
              id="classroom-prejoin.rules.name"
              defaultMessage="Use your first name or a nickname only."
            />
          </li>
          <li>
            <FormattedMessage
              id="classroom-prejoin.rules.screenshots"
              defaultMessage="Do not take or share screenshots or recordings of your classmates."
            />
          </li>
          <li>
            <FormattedMessage
              id="classroom-prejoin.rules.respect"
              defaultMessage="Be kind. Raise your hand to speak."
            />
          </li>
        </ul>
      </div>
      <ToggleInput
        checked={liteMode}
        disabled={reloading}
        onChange={e => onLiteModeChange(e.target.checked)}
        label={<FormattedMessage id="classroom-prejoin.lite.label" defaultMessage="Lite mode" />}
        description={
          reloading ? (
            <FormattedMessage id="classroom-prejoin.lite.reloading" defaultMessage="Reloading to apply…" />
          ) : (
            <FormattedMessage
              id="classroom-prejoin.lite.description"
              defaultMessage="For slower phones. Simpler graphics and less mobile data."
            />
          )
        }
      />
    </div>
  );
}

ClassroomPreJoin.propTypes = {
  liteMode: PropTypes.bool,
  reloading: PropTypes.bool,
  onLiteModeChange: PropTypes.func.isRequired
};
