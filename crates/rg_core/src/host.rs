// SPDX-License-Identifier: AGPL-3.0-or-later
//! What a game asks of its host, one frame's worth at a time: the script
//! queues these (`sound("jump")`, `vibrate(30)`, `save("best", 12)`, the
//! 3D scene's commands) and the engine hands them to the platform after the
//! frame. Each platform does what it can: a desktop without a vibration
//! motor ignores `vibrate`.

use crate::json::Json;
use ranger::prelude::*;

#[derive(Clone)]
pub struct HostCommand {
    /// `sound`, `music`, `stop`, `vibrate`, `save`, `three`, `title`, `log`
    pub kind: string,
    /// the sound's name or path, the key saved, the 3D command
    pub name: string,
    /// the rest, as the script gave it
    pub args: Json,
}

impl HostCommand {
    /// A command from the array the script queued: `[kind, name, args]`.
    pub fn from_json(v: &Json) -> HostCommand {
        let items = v.items();
        let mut kind = String::new();
        let mut name = String::new();
        let mut args = Json::Null;
        if items.len() > 0 {
            kind = items[0].as_str();
        }
        if items.len() > 1 {
            name = items[1].as_str();
        }
        if items.len() > 2 {
            args = items[2].clone();
        }
        HostCommand { kind: kind, name: name, args: args }
    }

    pub fn to_json(&self) -> Json {
        let mut items: Vec<Json> = Vec::new();
        items.push(Json::Str(self.kind.clone()));
        items.push(Json::Str(self.name.clone()));
        items.push(self.args.clone());
        Json::Arr(items)
    }
}

/// The commands of one frame as the JSON array the web host reads.
pub fn commands_json(cmds: &Vec<HostCommand>) -> string {
    let mut items: Vec<Json> = Vec::new();
    for c in cmds.iter() {
        items.push(c.to_json());
    }
    Json::Arr(items).write()
}
