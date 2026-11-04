"""Synthetic checks for clipped strokes, detached accents, neighbor gaps and rules."""
import unittest
import cv2
import numpy as np
from refinement import refine_regions

SETTINGS={"padding_width_fraction":0.03,"padding_height_fraction":0.04,
          "maximum_extension_width_fraction":0.1,"maximum_extension_height_fraction":0.1}
def region(box,index=1):
    return {"region_id":index,"type":"commentary","label":"commentary","box":box,
            "keep":True,"uncertain":False,"reading_order":index}
def apply(mask,items,rules=()):
    _,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
    return refine_regions(items,mask,labels,stats,SETTINGS,rules)

class RefinementTests(unittest.TestCase):
    def test_clipped_strokes_are_completed_without_changing_group(self):
        mask=np.zeros((150,200),np.uint8);mask[25:46,18:44]=1
        original=region([20,20,40,50])
        result,summary,warnings=apply(mask,[original])
        self.assertEqual(summary["content_cut_component_instances_before"],1)
        self.assertEqual(summary["content_cut_component_instances_after"],0)
        self.assertEqual(result[0]["type"],original["type"])
        self.assertEqual(result[0]["reading_order"],original["reading_order"])
        self.assertLessEqual(result[0]["box"][0],12)
        self.assertGreaterEqual(result[0]["box"][2],50)
    def test_padding_stops_between_neighboring_notes(self):
        mask=np.zeros((150,200),np.uint8);mask[30:50,20:40]=1;mask[30:50,44:65]=1
        result,summary,warnings=apply(mask,[region([20,30,40,50]),region([44,30,65,50],2)])
        self.assertLessEqual(result[0]["box"][2],result[1]["box"][0])
        self.assertEqual(summary["content_cut_component_instances_after"],0)
    def test_detached_accent_just_outside_box_is_included(self):
        mask=np.zeros((150,200),np.uint8);mask[22:42,20:40]=1;mask[17:20,26:31]=1
        result,summary,warnings=apply(mask,[region([20,22,40,42])])
        self.assertLessEqual(result[0]["box"][1],11)
        self.assertEqual(len(result[0]["boundary_refinement"]["assigned_components"]),2)
    def test_separator_rule_limits_padding(self):
        mask=np.zeros((150,200),np.uint8);mask[30:45,40:60]=1
        result,_,_=apply(mask,[region([40,30,60,45])],[(22,26)])
        self.assertEqual(result[0]["box"][1],26)
    def test_ambiguous_shared_component_is_recorded(self):
        mask=np.zeros((150,200),np.uint8);mask[30:50,20:60]=1
        result,summary,warnings=apply(mask,[region([20,30,40,50]),region([40,30,60,50],2)])
        self.assertEqual(len(summary["ambiguous_components"]),1)
        self.assertTrue(warnings)

if __name__=="__main__":
    unittest.main()
