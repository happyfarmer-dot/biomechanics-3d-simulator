"""
Z-Anatomy Blender Python Automation Script (prepare_zanatomy.py)
---------------------------------------------------------------
Usage:
  blender -b <path_to_zanatomy.blend> -P scripts/prepare_zanatomy.py

What it does:
  1. Filters & keeps all bones and superficial/major muscle groups.
  2. Mirrors any unilateral muscle across X=0 (Scale X = -1 + flip normals) so L/R are 100% symmetric.
  3. Applies DECIMATE modifier (ratio=0.25) to meshes > 800 triangles (total <= 120k tris).
  4. Classifies each mesh by functional driving jointId:
       - pectoralis, latissimus, deltoid, rotator cuff, biceps, triceps -> shoulder_L/R
       - forearm flexors/extensors, brachioradialis -> elbow_L/R
       - hand muscles -> wrist_L/R
       - quadriceps, hamstrings, adductors, gluteus, iliopsoas -> hip_L/R
       - gastrocnemius, soleus, tibialis, fibularis -> knee_L/R
       - foot muscles -> ankle_L/R
     and renames to BONE__<jointId>__<origName> or MUSCLE__<jointId>__<origName>.
  5. Exports with Draco compression (level=6) to public/models/anatomy_rigged.glb.
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
    "muscle", "musculi", "m.", "pectoralis", "deltoid", "biceps", "triceps",
    "brachioradialis", "brachialis", "coracobrachialis", "pronator", "supinator",
    "flexor", "extensor", "rectus abdominis", "external oblique", "internal oblique",
    "transversus abdominis", "trapezius", "latissimus", "rhomboid", "levator scapulae",
    "serratus", "erector spinae", "iliocostalis", "longissimus", "spinalis",
    "supraspinatus", "infraspinatus", "teres", "subscapularis",
    "gluteus", "iliopsoas", "psoas", "iliacus", "piriformis", "tensor fasciae",
    "quadriceps", "rectus femoris", "vastus", "sartorius", "gracilis", "adductor",
    "pectineus", "biceps femoris", "semitendinosus", "semimembranosus",
    "gastrocnemius", "soleus", "tibialis", "fibularis", "peroneus",
    "sternocleidomastoid", "masseter", "temporalis", "splenius",
]

EXCLUDE_MICRO_MUSCLES = [
    "rectus muscle", "oblique muscle", "tarsus", "palpebrae", "stapedius",
    "tensor tympani", "ciliary", "sphincter", "uvulae", "salpingopharyngeus",
    "palatopharyngeus", "stylopharyngeus", "arytenoid", "crico", "thyroarytenoid",
    "vocalis", "auricular", "nasalis", "procerus", "risorius", "mentalis",
]

TARGET_MAX_TRIS = 120000


def get_world_bbox_center(obj):
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(bbox, Vector((0.0, 0.0, 0.0))) / 8.0


def classify_kind(name_lower):
    for kw in BONE_KEYWORDS:
        if kw in name_lower:
            return "BONE"
    if any(ex in name_lower for ex in EXCLUDE_MICRO_MUSCLES):
        return None
    for kw in MUSCLE_KEYWORDS:
        if kw in name_lower:
            return "MUSCLE"
    return None


def detect_side(name_lower, center_x):
    if ".l" in name_lower or "_l" in name_lower or "left" in name_lower:
        return "L"
    if ".r" in name_lower or "_r" in name_lower or "right" in name_lower:
        return "R"
    return "L" if center_x >= 0 else "R"


def classify_joint_id(name_lower, norm_y, center_x):
    side = detect_side(name_lower, center_x)

    if any(k in name_lower for k in ["skull", "cranium", "mandible", "maxilla", "masseter", "temporalis"]):
        return "head"
    if any(k in name_lower for k in ["cervical", "sternocleidomastoid", "hyoid", "atlas", "axis", "splenius"]):
        return "neck"

    # Shoulder-driven muscles & humerus
    if any(k in name_lower for k in [
        "humerus", "deltoid", "pectoralis", "latissimus", "supraspinatus",
        "infraspinatus", "teres", "subscapularis", "coracobrachialis",
        "biceps brachii", "triceps",
    ]):
        return f"shoulder_{side}"

    # Elbow-driven forearm bones & muscles
    if any(k in name_lower for k in [
        "radius", "ulna", "brachioradialis", "brachialis", "pronator",
        "supinator", "flexor carpi", "extensor carpi", "flexor digitorum",
        "extensor digitorum", "forearm", "anconeus",
    ]) and "longus" not in name_lower and "brevis" not in name_lower:
        return f"elbow_{side}"

    # Wrist/hand
    if any(k in name_lower for k in ["carpal", "metacarpal", "hand", "thenar", "hypothenar", "lumbrical"]) or (
        "phalanx" in name_lower and norm_y > 0.35
    ):
        return f"wrist_{side}"

    # Hip-driven thigh/gluteal muscles & femur
    if any(k in name_lower for k in [
        "femur", "quadriceps", "rectus femoris", "vastus", "sartorius", "gracilis",
        "adductor", "pectineus", "biceps femoris", "semitendinosus", "semimembranosus",
        "gluteus", "iliopsoas", "psoas", "iliacus", "tensor fasciae", "piriformis",
    ]):
        return f"hip_{side}"

    # Knee-driven lower leg bones & muscles
    if any(k in name_lower for k in [
        "tibia", "fibula", "patella", "gastrocnemius", "soleus", "tibialis",
        "fibularis", "peroneus", "popliteus",
    ]):
        return f"knee_{side}"

    # Ankle/foot
    if any(k in name_lower for k in ["tarsal", "metatarsal", "talus", "calcaneus", "foot"]) or (
        "phalanx" in name_lower and norm_y <= 0.35
    ):
        return f"ankle_{side}"

    # Spine & Trunk
    if any(k in name_lower for k in ["pelvis", "ilium", "ischium", "pubis", "sacrum", "coccyx"]):
        return "pelvis"
    if any(k in name_lower for k in ["lumbar", "rectus abdominis", "external oblique", "internal oblique", "transversus", "erector spinae"]):
        return "lumbar"
    if any(k in name_lower for k in ["rib", "sternum", "manubrium", "clavicle", "scapula", "thoracic", "trapezius", "rhomboid", "serratus"]):
        return "thorax"

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


def mirror_missing_muscles(kept):
    existing_names = {obj.name.lower() for obj, _ in kept}
    mirrored = []
    for obj, kind in kept:
        if kind != "MUSCLE":
            continue
        nl = obj.name.lower()
        target_name = None
        if ".l" in nl:
            target_name = obj.name.replace(".l", ".r").replace(".L", ".R")
        elif ".r" in nl:
            target_name = obj.name.replace(".r", ".l").replace(".R", ".L")
        if target_name and target_name.lower() not in existing_names:
            dup = obj.copy()
            dup.data = obj.data.copy()
            dup.name = target_name
            bpy.context.collection.objects.link(dup)
            dup.scale.x *= -1
            bpy.context.view_layer.objects.active = dup
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.flip_normals()
            bpy.ops.object.mode_set(mode="OBJECT")
            mirrored.append((dup, kind))
            existing_names.add(target_name.lower())
    return mirrored


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    out_dir = os.path.join(project_root, "public", "models")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "anatomy_rigged.glb")

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

    mirrored = mirror_missing_muscles(kept)
    kept.extend(mirrored)
    print(f"[Z-Anatomy] Kept {len(kept)} meshes (mirrored {len(mirrored)}), removed {removed}.")

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

    total_tris = 0
    for obj, _ in kept:
        tris = get_tri_count(obj)
        if tris > 800:
            mod = obj.modifiers.new(name="AutoDecimate", type="DECIMATE")
            mod.ratio = 0.25
            mod.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
            tris = get_tri_count(obj)
        total_tris += tris

    if total_tris > TARGET_MAX_TRIS:
        scale_ratio = max(0.2, TARGET_MAX_TRIS / total_tris)
        for obj, _ in kept:
            if get_tri_count(obj) > 400:
                mod = obj.modifiers.new(name="Pass2Decimate", type="DECIMATE")
                mod.ratio = scale_ratio
                mod.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=mod.name)

    for obj, kind in kept:
        c = centers[obj.name]
        norm_y = (c.z - min_z) / span_z
        joint_id = classify_joint_id(obj.name.lower(), norm_y, c.x)
        clean_orig = obj.name.replace(" ", "_").replace(".", "_")
        obj.name = f"{kind}__{joint_id}__{clean_orig}"

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
