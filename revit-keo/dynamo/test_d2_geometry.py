import unittest
from d2_geometry import walk_symbol_geometry, box_contains


class Transform:
    def __init__(self, matrix): self.matrix = matrix
    def Multiply(self, other):
        a, b = self.matrix, other.matrix
        return Transform([[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)])
    def Dispose(self): pass


class Geometry(list):
    disposed = False
    def Dispose(self): self.disposed = True


class Solid: pass


class Instance:
    def __init__(self, transform, child): self.Transform, self.child = transform, child
    def GetSymbolGeometry(self): return self.child
    def GetInstanceGeometry(self): raise AssertionError('Must not double apply placement')


class DB:
    GeometryInstance, Solid = Instance, Solid


IDENTITY = Transform([[1, 0, 0], [0, 1, 0], [0, 0, 1]])


class PhysicalGeometryTests(unittest.TestCase):
    def test_nested_rotation_translation_order_and_top_level_solids(self):
        rotation = Transform([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
        translation = Transform([[1, 0, 3], [0, 1, 4], [0, 0, 1]])
        inner = Geometry([Solid()])
        outer = Geometry([Instance(translation, inner)])
        root = Geometry([Solid(), Instance(rotation, outer)])
        seen = []
        walk_symbol_geometry(root, IDENTITY, DB, lambda s,t,p: seen.append((t.matrix,p)), lambda *a: None)
        self.assertEqual(seen[0], (IDENTITY.matrix, (0,)))
        self.assertEqual(seen[1], ([[0,-1,-4],[1,0,3],[0,0,1]], (1,0,0)))
        self.assertTrue(inner.disposed and outer.disposed)

    def test_dispose_on_callback_failure(self):
        child = Geometry([Solid()])
        def fail(*args): raise RuntimeError('failure')
        with self.assertRaises(RuntimeError):
            walk_symbol_geometry([Instance(IDENTITY, child)], IDENTITY, DB, fail, fail)
        self.assertTrue(child.disposed)

    def test_depth_cap_and_unknown_geometry_are_explicit(self):
        with self.assertRaises(ValueError):
            walk_symbol_geometry([], IDENTITY, DB, None, None, depth=13)
        other = []
        walk_symbol_geometry(['mesh'], IDENTITY, DB, None, lambda obj,path: other.append((obj,path)))
        self.assertEqual(other, [('mesh',(0,))])

    def test_bbox_check_detects_wrong_transform(self):
        outer = [[0,0,0],[1,1,1]]
        self.assertTrue(box_contains(outer, [[0.1,0.1,0.1],[0.9,0.9,0.9]]))
        self.assertFalse(box_contains(outer, [[3,0,0],[4,1,1]]))


if __name__ == '__main__': unittest.main()
