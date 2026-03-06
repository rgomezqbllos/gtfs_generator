-- Foot profile

api_version = 4

Set = require('lib/set')
Sequence = require('lib/sequence')
Handlers = require("lib/way_handlers")
Relations = require("lib/relations")
find_access_tag = require("lib/access").find_access_tag
limit = require("lib/maxspeed").limit
Utils = require("lib/utils")
Measure = require("lib/measure")

function setup()
  return {
    properties = {
      max_speed_for_map_matching      = 5/3.6, -- 5kmph -> m/s
      weight_name                     = 'duration',
      process_call_tagless_node      = false,
      u_turn_penalty                 = 0,
      continue_straight_at_waypoint  = false,
      use_turn_restrictions          = false,
      left_hand_driving              = false,
      traffic_light_penalty          = 2,
    },

    default_mode              = mode.walking,
    default_speed             = 5,
    oneway_handling           = false,
    side_road_multiplier      = 1.0,
    turn_penalty              = 0,
    speed_reduction           = 1.0,

    barrier_whitelist = Set {
      'cattle_grid',
      'border_control',
      'sally_port',
      'gate',
      'no',
      'entrance'
    },

    access_tag_whitelist = Set {
      'yes',
      'foot',
      'permissive',
      'designated'
    },

    access_tag_blacklist = Set {
      'no',
      'private',
      'delivery'
    },

    restricted_access_tag_list = Set {
      'private',
      'delivery'
    },

    access_tags_hierarchy = Sequence {
      'foot',
      'access'
    },

    service_tag_forbidden = Set {
    },

    restrictions = Sequence {
      'foot'
    },

    classes = Sequence {
    },

    excludable = Sequence {
    },

    avoid = Set {
      'impassable',
      'construction',
      'proposed'
    },

    speeds = Sequence {
      highway = {
        primary         = 5,
        primary_link    = 5,
        secondary       = 5,
        secondary_link  = 5,
        tertiary        = 5,
        tertiary_link   = 5,
        unclassified    = 5,
        residential     = 5,
        living_street   = 5,
        service         = 5,
        footway         = 5,
        path            = 5,
        steps           = 2,
        pedestrian      = 5,
        track           = 4
      }
    },

    highway_turn_classification = {
    },

    access_turn_classification = {
    }
  }
end

function process_node(profile, node, result, relations)
  local access = find_access_tag(node, profile.access_tags_hierarchy)
  if access then
    if profile.access_tag_blacklist[access] then
      result.barrier = true
    end
  end
end

function process_way(profile, way, result, relations)
  local data = {
    highway = way:get_value_by_key('highway'),
    route = way:get_value_by_key('route')
  }

  if (not data.highway or data.highway == '') and (not data.route or data.route == '') then
    return
  end

  handlers = Sequence {
    WayHandlers.default_mode,
    WayHandlers.blocked_ways,
    WayHandlers.access,
    WayHandlers.speed,
    WayHandlers.names,
    WayHandlers.weights
  }

  WayHandlers.run(profile, way, result, data, handlers, relations)
end

function process_turn(profile, turn)
  turn.duration = 0
  turn.weight = 0
end

return {
  setup = setup,
  process_way = process_way,
  process_node = process_node,
  process_turn = process_turn
}
