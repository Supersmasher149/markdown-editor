//! Every operation the frontend is allowed to perform.
//!
//! The frontend holds no filesystem or shell permissions of its own, so this
//! module is the complete list of privileged actions available to it.

pub mod files;
pub mod settings;
