import React, { useState } from "react";
import { RoomEntryModal } from "../room/RoomEntryModal";
import { ClassroomPreJoin } from "./ClassroomPreJoin";

export default {
  title: "Classroom/ClassroomPreJoin",
  parameters: {
    layout: "fullscreen"
  }
};

function Interactive() {
  const [lite, setLite] = useState(false);
  return (
    <RoomEntryModal roomName="Grade 8 Science — Section Rizal" showEnterOnDevice={false}>
      <ClassroomPreJoin liteMode={lite} onLiteModeChange={setLite} />
    </RoomEntryModal>
  );
}

export const InEntryModal = () => <Interactive />;
export const Reloading = () => (
  <RoomEntryModal roomName="Grade 8 Science — Section Rizal" showEnterOnDevice={false}>
    <ClassroomPreJoin liteMode reloading onLiteModeChange={() => {}} />
  </RoomEntryModal>
);
