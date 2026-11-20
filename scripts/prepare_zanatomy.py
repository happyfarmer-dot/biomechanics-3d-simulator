"""
Z-Anatomy Blender Python Automation Script (prepare_zanatomy.py)
---------------------------------------------------------------
Usage:
  blender -b <path_to_zanatomy.blend> -P scripts/prepare_zanatomy.py

What it does:
  1. Filters & keeps all major skeletal bones and superficial major muscles.
  2. Applies DECIMATE modifier (ratio=0.25) to meshes > 800 triangles to keep total <= 120k tris.
  3. Classifies each mesh into biomechanics jointId (head, neck, thorax, lumbar, pelvis,
     shoulder_L/R, elbow_L/R, wrist_L/R, hip_L/R, knee_L/R, ankle_L/R) and renames to:
       BONE__<jointId>__<origName>
       MUSCLE__<jointId>__<origName>
  4. Exports with Draco compression (level=6) to public/models/anatomy_rigged.glb
"""

import os
import sys
import bpy
from mathutils import Vector

BONE_KEYWORDS = [
    "bone", "skull", "cranium", "rib", "vertebra", "femur", "tibia", "fibula",
    "humerus", "radius", "ulna", "pelvis", "ilium", "ischium", "pubis", "sacrum",
    "coccyx", "clavicle", "scapula", "patella", "sternum", "manubrium", "mandible",
    "maxilla", "carpal", "metacarpal", "tarsal", "metatarsal", "phalanx", "phalanges",
    "talus", "calcaneus", "hyoid",
]

MUSCLE_KEYWORDS = [
    "pectoralis", "deltoid", "biceps", "triceps", "brachioradialis",
    "rectus abdominis", "external oblique", "trapezius", "latissimus",
    "erector spinae", "gluteus", "quadriceps", "rectus femoris", "vastus",
    "biceps femoris", "semitendinosus", "semimembranosus", "gastrocnemius",
    "soleus", "tibialis", "sternocleidomastoid", "masseter",
]

TARGET_MAX_TRIS = 120000


def get_world_bbox_center(obj):
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    center = sum(bbox, Vector((0.0, 0.0, 0.0))) / 8.0
    return center


def classify_kind(name_lower):
    for kw in BONE_KEYWORDS:
        if kw in name_lower:
            return "BONE"
    for kw in MUSCLE_KEYWORDS:
        if kw in name_lower:
            return "MUSCLE"
    return None


def detect_side(name_lower, center_x):
    if ".l" in name_lower or "_l" in name_lower or "left" in name_lower:
        return "L"
    if ".r" in name_lower or "_r" in name_lower or "right" in name_lower:
        return "R"
    # Z-Anatomy uses Blender convention (+X = model's Left or Right depending on orientation)
    return "L" if center_x >= 0 else "R"


def classify_joint_id(name_lower, norm_y, center_x):
    side = detect_side(name_lower, center_x)

    # Head & Neck
    if any(k in name_lower for k in ["skull", "cranium", "mandible", "maxilla", "masseter"]):
        return "head"
    if any(k in name_lower for k in ["cervical", "sternocleidomastoid", "hyoid", "atlas", "axis"]):
        return "neck"

    # Upper Limb
    if any(k in name_lower for k in ["humerus", "deltoid", "biceps brachii", "triceps"]):
        return f"shoulder_{side}"
    if any(k in name_lower for k in ["radius", "ulna", "brachioradialis", "forearm"]):
        return f"elbow_{side}"
    if any(k in name_lower for k in ["carpal", "metacarpal", "hand"]) or (
        "phalanx" in name_lower and norm_y > 0.35
    ):
        return f"wrist_{side}"

    # Lower Limb
    if any(k in name_lower for k in ["femur", "quadriceps", "rectus femoris", "vastus", "biceps femoris", "semitendinosus", "semimembranosus", "gluteus"]):
        return f"hip_{side}"
    if any(k in name_lower for k in ["tibia", "fibula", "patella", "gastrocnemius", "soleus", "tibialis"]):
        return f"knee_{side}"
    if any(k in name_lower for k in ["tarsal", "metatarsal", "talus", "calcaneus", "foot"]) or (
        "phalanx" in name_lower and norm_y <= 0.35
    ):
        return f"ankle_{side}"

    # Spine & Trunk
    if any(k in name_lower for k in ["pelvis", "ilium", "ischium", "pubis", "sacrum", "coccyx"]):
        return "pelvis"
    if any(k in name_lower for k in ["lumbar", "rectus abdominis", "external oblique", "erector spinae"]):
        return "lumbar"
    if any(k in name_lower for k in ["rib", "sternum", "manubrium", "clavicle", "scapula", "thoracic", "pectoralis", "trapezius", "latissimus"]):
        return "thorax"

    # Spatial fallback by normalized height (0 = feet, 1 = crown)
    if norm_y > 0.88:
        return "head"
    if norm_y > 0.82:
        return "neck"
    if norm_y > 0.62:
        return "thorax"
    if norm_y > 0.54:
        return "lumbar"
    if norm_y > 0.45:
        return "pelvis"
    if norm_y > 0.25:
        return f"hip_{side}"
    if norm_y > 0.06:
        return f"knee_{side}"
    return f"ankle_{side}"


def get_tri_count(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    eval_obj.to_mesh_clear()
    return count


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    out_dir = os.path.join(project_root, "public", "models")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "anatomy_rigged.glb")

    mesh_objs = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    kept = []
    removed = 0

    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        kind = classify_kind(obj.name.lower())
        if kind is None:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
        else:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            kept.append((obj, kind))

    print(f"[Z-Anatomy] Kept {len(kept)} meshes, removed {removed} non-target objects.")
    if not kept:
        print("[Z-Anatomy] ERROR: No matching bone/muscle meshes found.")
        sys.exit(1)

    # Compute overall Z bounds in Blender (Z-up)
    all_z = []
    centers = {}
    for obj, _ in kept:
        c = get_world_bbox_center(obj)
        centers[obj.name] = c
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            all_z.append(wc.z)

    min_z, max_z = min(all_z), max(all_z)
    span_z = max(max_z - min_z, 1e-4)

    # Apply DECIMATE (ratio = 0.25) to meshes > 800 tris
    bpy.context.view_layer.objects.active = None
    total_tris = 0
    for obj, kind in kept:
        tris = get_tri_count(obj)
        if tris > 800:
            mod = obj.modifiers.new(name="AutoDecimate", type="DECIMATE")
            mod.ratio = 0.25
            mod.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
            tris = get_tri_count(obj)
        total_tris += tris

    # Second pass if total triangles still exceed 120,000
    if total_tris > TARGET_MAX_TRIS:
        scale_ratio = max(0.2, TARGET_MAX_TRIS / total_tris)
        print(f"[Z-Anatomy] Total tris {total_tris} > {TARGET_MAX_TRIS}, applying pass-2 decimate ({scale_ratio:.2f})...")
        total_tris = 0
        for obj, _ in kept:
            tris = get_tri_count(obj)
            if tris > 400:
                mod = obj.modifiers.new(name="Pass2Decimate", type="DECIMATE")
                mod.ratio = scale_ratio
                mod.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=mod.name)
                tris = get_tri_count(obj)
            total_tris += tris

    print(f"[Z-Anatomy] Final total triangles: {total_tris}")

    # Rename meshes to BONE__<jointId>__<origName> or MUSCLE__<jointId>__<origName>
    for obj, kind in kept:
        c = centers[obj.name]
        norm_y = (c.z - min_z) / span_z
        joint_id = classify_joint_id(obj.name.lower(), norm_y, c.x)
        clean_orig = obj.name.replace(" ", "_").replace(".", "_")
        obj.name = f"{kind}__{joint_id}__{clean_orig}"

    # Export GLB with Draco compression (level=6)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_compression_level=6,
        export_materials="NONE",
    )
    print(f"[Z-Anatomy] Exported successfully to {out_path}")


if __name__ == "__main__":
    main()
