import React, { useState } from "react";
import PropTypes from "prop-types";
import { RoomLayout } from "../layout/RoomLayout";
import { TeacherHudSidebar } from "./TeacherHudSidebar";

export default {
  title: "Classroom/TeacherHudSidebar",
  parameters: {
    layout: "fullscreen"
  }
};

const NOW = Date.now();
const QUEUE = [
  { id: "a", name: "Andrea", since: NOW - 95000 },
  { id: "b", name: "Bong", since: NOW - 40000 },
  { id: "c", name: "Carmela", since: NOW - 5000 }
];

function Interactive({ initialLecture = false, learnerCount = 28, seatCount = 30, handQueue = QUEUE }) {
  const [lectureMode, setLectureMode] = useState(initialLecture);
  const [seatLocked, setSeatLocked] = useState(initialLecture);
  const [permissions, setPermissions] = useState({
    voice_chat: !initialLecture,
    text_chat: !initialLecture,
    spawn_and_move_media: !initialLecture,
    spawn_drawing: !initialLecture,
    fly: false
  });
  return (
    <RoomLayout
      viewport={<div style={{ height: "100vh" }} />}
      sidebar={
        <TeacherHudSidebar
          learnerCount={learnerCount}
          seatCount={seatCount}
          lectureMode={lectureMode}
          seatLocked={seatLocked}
          permissions={permissions}
          handQueue={handQueue}
          now={NOW}
          onLectureMode={on => {
            setLectureMode(on);
            setSeatLocked(on);
            setPermissions(p => ({
              ...p,
              voice_chat: !on,
              text_chat: !on,
              spawn_and_move_media: !on,
              spawn_drawing: !on
            }));
          }}
          onMuteAll={() => {}}
          onGather={() => {}}
          onSeatLock={setSeatLocked}
          onTogglePermission={(key, allowed) => setPermissions(p => ({ ...p, [key]: allowed }))}
        />
      }
    />
  );
}

Interactive.propTypes = {
  initialLecture: PropTypes.bool,
  learnerCount: PropTypes.number,
  seatCount: PropTypes.number,
  handQueue: PropTypes.array
};

export const OpenClass = () => <Interactive />;
export const LectureMode = () => <Interactive initialLecture />;
export const EmptyRoom = () => <Interactive learnerCount={0} handQueue={[]} />;
export const NotEnoughSeats = () => <Interactive learnerCount={34} seatCount={30} />;
