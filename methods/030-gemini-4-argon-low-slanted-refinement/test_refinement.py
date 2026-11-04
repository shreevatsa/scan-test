"""Focused checks for component completion and text-preserving separator constraints."""
import unittest
import cv2
import numpy as np
from refinement import refine_regions
from separators import detect_separators,make_refinement_mask

SETTINGS={"padding_width_fraction":0.03,"padding_height_fraction":0.04,
          "maximum_extension_width_fraction":0.1,"maximum_extension_height_fraction":0.1,
          "separator_gap_pixels":1}
DETECTOR={"minimum_span_pixels":80,"minimum_span_width_fraction":0.08,"maximum_height_fraction":0.05,"minimum_aspect_ratio":10,"median_thickness_height_fraction":0.003,"minimum_filled_column_fraction":0.95,"maximum_absolute_slope":0.05,"fit_residual_height_fraction":0.0015}
def region(box,index=1):
    return {"region_id":index,"type":"commentary","label":"commentary","box":box,
            "keep":True,"uncertain":False,"reading_order":index}
def apply(mask,items,rules=()):
    _,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
    return refine_regions(items,mask,labels,stats,SETTINGS,rules)
def rule(top,bottom,width=200):
    return {"separator_id":1,"columns_x":list(range(width)),
            "top_by_column":[top]*width,"bottom_exclusive_by_column":[bottom]*width}

class RefinementTests(unittest.TestCase):
    def test_clipped_strokes_are_completed_without_changing_group(self):
        mask=np.zeros((150,200),np.uint8);mask[25:46,18:44]=1
        original=region([20,20,40,50])
        result,summary,_=apply(mask,[original])
        self.assertEqual(summary["content_cut_component_instances_before"],1)
        self.assertEqual(summary["content_cut_component_instances_after"],0)
        self.assertEqual(result[0]["type"],original["type"])
        self.assertEqual(result[0]["reading_order"],original["reading_order"])
        self.assertLessEqual(result[0]["box"][0],12)
        self.assertGreaterEqual(result[0]["box"][2],50)
    def test_padding_stops_between_neighboring_notes(self):
        mask=np.zeros((150,200),np.uint8);mask[30:50,20:40]=1;mask[30:50,44:65]=1
        result,summary,_=apply(mask,[region([20,30,40,50]),region([44,30,65,50],2)])
        self.assertLessEqual(result[0]["box"][2],result[1]["box"][0])
        self.assertEqual(summary["content_cut_component_instances_after"],0)
    def test_detached_accent_is_included(self):
        mask=np.zeros((150,200),np.uint8);mask[22:42,20:40]=1;mask[17:20,26:31]=1
        result,_,_=apply(mask,[region([20,22,40,42])])
        self.assertLessEqual(result[0]["box"][1],11)
    def test_rule_limits_padding(self):
        mask=np.zeros((150,200),np.uint8);mask[30:45,40:60]=1
        result,_,_=apply(mask,[region([40,30,60,45])],[rule(22,26)])
        self.assertEqual(result[0]["box"][1],27)
    def test_ambiguous_shared_component_is_recorded(self):
        mask=np.zeros((150,200),np.uint8);mask[30:50,20:60]=1
        _,summary,warnings=apply(mask,[region([20,30,40,50]),region([40,30,60,50],2)])
        self.assertEqual(len(summary["ambiguous_components"]),1)
        self.assertTrue(warnings)
    def test_slanted_separator_is_detected(self):
        rgb=np.full((400,600,3),255,np.uint8)
        cv2.line(rgb,(30,300),(550,286),(0,0,0),2)
        mask,rules=detect_separators(rgb,DETECTOR)
        self.assertEqual(len(rules),1)
        self.assertLess(rules[0]["slope"],0)
        self.assertGreater(int(mask.sum()),1000)
    def test_headline_and_character_stems_are_preserved(self):
        rgb=np.full((400,600,3),255,np.uint8)
        cv2.line(rgb,(50,100),(450,100),(0,0,0),3)
        for x in range(50,450,25):rgb[100:133,x:x+12]=0
        mask,rules=detect_separators(rgb,DETECTOR)
        self.assertEqual(len(rules),0)
        self.assertEqual(int(mask.sum()),0)
    def test_rule_touching_tall_glyph_is_not_removed_wholesale(self):
        rgb=np.full((400,600,3),255,np.uint8)
        cv2.line(rgb,(30,300),(550,286),(0,0,0),2)
        rgb[290:335,300:310]=0
        _,rules=detect_separators(rgb,DETECTOR)
        self.assertEqual(len(rules),0)
    def test_source_whitespace_can_be_trimmed_without_losing_glyphs(self):
        rgb=np.full((400,600,3),255,np.uint8)
        rgb[260:280,60:150]=0
        cv2.line(rgb,(30,300),(550,286),(0,0,0),2)
        mask,labels,stats,_,rules,separator_mask,_=make_refinement_mask(rgb,DETECTOR)
        refined,summary,_=refine_regions([region([50,250,160,305])],mask,labels,stats,SETTINGS,rules)
        x1,y1,x2,y2=refined[0]["box"]
        self.assertLess(y2,305)
        self.assertGreaterEqual(y2,280)
        self.assertEqual(int(separator_mask[y1:y2,x1:x2].sum()),0)
        self.assertEqual(summary["content_cut_component_instances_after"],0)
    def test_text_spanning_separator_is_flagged_and_retained(self):
        mask=np.zeros((150,200),np.uint8);mask[20:40,40:60]=1;mask[65:85,40:60]=1
        refined,summary,warnings=apply(mask,[region([35,15,65,90])],[rule(50,53)])
        self.assertTrue(summary["unresolved_separator_regions"])
        self.assertTrue(warnings)
        self.assertLessEqual(refined[0]["box"][1],20)
        self.assertGreaterEqual(refined[0]["box"][3],85)

if __name__=="__main__":
    unittest.main()
