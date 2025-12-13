# Imports
from kivymd.app import MDApp
from kivymd.uix.screen import MDScreen
from kivymd.uix.screenmanager import MDScreenManager
from kivymd.uix.list import MDList, OneLineListItem
from kivymd.uix.boxlayout import MDBoxLayout
from kivymd.uix.label import MDLabel
from kivymd.uix.button import MDRaisedButton
from kivymd.uix.dialog import MDDialog
from kivymd.uix.scrollview import MDScrollView
from kivymd.uix.toolbar import MDTopAppBar
from kivymd.uix.textfield import MDTextField
from kivy.properties import DictProperty, ListProperty, StringProperty
from kivy.lang import Builder
from kivy.metrics import dp
from kivy.utils import get_color_from_hex
from kivy.clock import Clock
from pathlib import Path
import json
import threading

from services import DataService


def format_location(loc_str):
    """Format location: 'junk_planetoid' -> 'Junk Planetoid'"""
    if not loc_str:
        return "Unknown"
    return loc_str.replace("_", " ").title()


class Config:
    cdn_host = "https://oakshiftsoftware.github.io/cdn/young-suns-companion"
    
    def __init__(self):
        self.resources_path = str("/".join([self.cdn_host, "resources.json"]))
        self.blueprints_path = str("/".join([self.cdn_host, "blueprints.json"]))
        self.app_name = "Young Sun's Companion"
        self.app_version = "0.0.1"
        self.app_author = "Oakshift Software"
        self.app_description = "A companion app for Young Sun's Xbox game. Allowing for users to create a list of things they wish to build, and have the companion app list the required resources and locations where they can be found."


class BuildQueueScreen(MDScreen):
    title = StringProperty("Build Queue")
    
    def on_enter(self):
        self.refresh()
    
    def refresh(self):
        app = MDApp.get_running_app()
        self.ids.queue_list.clear_widgets()
        if not app.build_queue:
            self.ids.queue_list.add_widget(
                OneLineListItem(text="Tap '+' to add blueprints", disabled=True)
            )
            return
        for item in app.build_queue:
            bp = app.blueprints.get(item, {})
            display_name = bp.get("name", item)
            self.ids.queue_list.add_widget(
                OneLineListItem(
                    text=display_name,
                    on_release=lambda x, n=item: app.show_blueprint_detail(n)
                )
            )


class BlueprintsScreen(MDScreen):
    title = StringProperty("Add Blueprint")
    
    def on_enter(self):
        app = MDApp.get_running_app()
        self.ids.blueprint_list.clear_widgets()
        
        intermediates = []
        equipment = []
        for bp_id, bp_data in app.blueprints.items():
            variant = bp_data.get("variant", "")
            if variant == "intermediate":
                intermediates.append((bp_id, bp_data))
            elif variant == "equipment":
                equipment.append((bp_id, bp_data))
        
        if intermediates:
            self.ids.blueprint_list.add_widget(
                OneLineListItem(text="Intermediates", disabled=True, theme_text_color="Primary")
            )
            for bp_id, bp_data in sorted(intermediates, key=lambda x: x[1].get("name", "")):
                display = f"  {bp_data.get('name', bp_id)}"
                self.ids.blueprint_list.add_widget(
                    OneLineListItem(text=display, on_release=lambda x, n=bp_id: app.add_to_build_queue(n))
                )
        
        if equipment:
            self.ids.blueprint_list.add_widget(
                OneLineListItem(text="Equipment", disabled=True, theme_text_color="Primary")
            )
            for bp_id, bp_data in sorted(equipment, key=lambda x: x[1].get("name", "")):
                display = f"  {bp_data.get('name', bp_id)}"
                self.ids.blueprint_list.add_widget(
                    OneLineListItem(text=display, on_release=lambda x, n=bp_id: app.add_to_build_queue(n))
                )


class BlueprintDetailScreen(MDScreen):
    title = StringProperty("Blueprint Details")
    blueprint_id = StringProperty("")
    
    def on_enter(self):
        self.refresh()

    def on_pre_enter(self):
        if hasattr(self, "ids") and "detail_list" in self.ids:
            self.ids.detail_list.clear_widgets()
        self.title = "Loading..."
    
    def refresh(self):
        app = MDApp.get_running_app()
        self.ids.detail_list.clear_widgets()
        
        if not self.blueprint_id:
            return
        
        bp = app.blueprints.get(self.blueprint_id, {})
        bp_name = bp.get("name", self.blueprint_id)
        variant = bp.get("variant", "")
        medium = bp.get("medium", "")
        self.title = bp_name or "Details"
        
        self.ids.detail_list.add_widget(
            OneLineListItem(text=f"Name: {bp_name}", disabled=True)
        )
        self.ids.detail_list.add_widget(
            OneLineListItem(text=f"Type: {variant.title()}", disabled=True)
        )
        self.ids.detail_list.add_widget(
            OneLineListItem(text=f"Made in: {medium.title()}", disabled=True)
        )
        self.ids.detail_list.add_widget(
            OneLineListItem(text="Required:", disabled=True, theme_text_color="Primary")
        )
        
        required = bp.get("required", [])
        for req in required:
            item_id = req.get("item", "")
            qty = req.get("quantity", 0)
            
            if item_id in app.blueprints:
                intermediate_bp = app.blueprints[item_id]
                item_name = intermediate_bp.get("name", item_id)
                self.ids.detail_list.add_widget(
                    OneLineListItem(text=f"  - {item_name} x{qty} (intermediate)", disabled=True)
                )
                for sub_req in intermediate_bp.get("required", []):
                    sub_item_id = sub_req.get("item", "")
                    sub_qty = sub_req.get("quantity", 0)
                    total_sub_qty = sub_qty * qty
                    res_data = app.resources.get(sub_item_id, {})
                    res_name = res_data.get("name", sub_item_id)
                    loc = format_location(res_data.get("location", ""))
                    self.ids.detail_list.add_widget(
                        OneLineListItem(text=f"    - {res_name} x{total_sub_qty} ({loc})", disabled=True)
                    )
            else:
                res_data = app.resources.get(item_id, {})
                res_name = res_data.get("name", item_id)
                loc = format_location(res_data.get("location", ""))
                self.ids.detail_list.add_widget(
                    OneLineListItem(text=f"  - {res_name} x{qty} ({loc})", disabled=True)
                )


class ResourcesScreen(MDScreen):
    title = StringProperty("Resource Tracker")
    
    def on_enter(self):
        self.refresh()
    
    def refresh(self):
        app = MDApp.get_running_app()
        totals = app.compute_totals()
        self.ids.resources_list.clear_widgets()
        
        if not totals or not totals.get("resources"):
            self.ids.resources_list.add_widget(
                OneLineListItem(text="No items in queue", disabled=True)
            )
            return
        
        for res_id, required_qty in sorted(totals.get("resources", {}).items()):
            res_data = app.resources.get(res_id, {})
            res_name = res_data.get("name", res_id)
            loc = format_location(res_data.get("location", ""))
            collected = app.resource_tracker.get(res_id, 0)
            
            item = self._create_resource_item(res_id, res_name, required_qty, collected, loc)
            self.ids.resources_list.add_widget(item)
    
    def _create_resource_item(self, res_id, res_name, required, collected, location):
        from kivymd.uix.boxlayout import MDBoxLayout
        from kivymd.uix.button import MDIconButton
        
        box = MDBoxLayout(orientation="horizontal", size_hint_y=None, height=dp(64), padding=dp(8), spacing=dp(8))
        
        info_box = MDBoxLayout(orientation="vertical", size_hint_x=1)
        name_label = MDLabel(text=res_name, size_hint_y=None, height=dp(20), font_style="Body1")
        loc_label = MDLabel(text=f"({location})", size_hint_y=None, height=dp(16), font_style="Caption", theme_text_color="Secondary")
        info_box.add_widget(name_label)
        info_box.add_widget(loc_label)
        
        counter_box = MDBoxLayout(orientation="horizontal", size_hint_x=None, spacing=dp(4))
        counter_box.bind(minimum_width=counter_box.setter("width"))
        count_label = MDLabel(
            text=f"{collected}/{required}",
            halign="center",
            font_style="Body1",
            size_hint_x=None,
            width=dp(96),
        )
        minus_btn = MDIconButton(icon="minus", on_release=lambda x: self._decrement(res_id, required, count_label))
        plus_btn = MDIconButton(icon="plus", on_release=lambda x: self._increment(res_id, required, count_label))
        edit_btn = MDIconButton(icon="pencil", on_release=lambda x: self._prompt_set(res_id, required, count_label))
        clear_btn = MDIconButton(icon="close", on_release=lambda x: self._clear_count(res_id, required, count_label))
        
        counter_box.add_widget(minus_btn)
        counter_box.add_widget(count_label)
        counter_box.add_widget(plus_btn)
        counter_box.add_widget(edit_btn)
        counter_box.add_widget(clear_btn)
        
        box.add_widget(info_box)
        box.add_widget(counter_box)
        
        return box
    
    def _increment(self, res_id, required, label_widget):
        app = MDApp.get_running_app()
        app.resource_tracker[res_id] = app.resource_tracker.get(res_id, 0) + 1
        app.save_tracker()
        label_widget.text = f"{app.resource_tracker[res_id]}/{required}"
    
    def _decrement(self, res_id, required, label_widget):
        app = MDApp.get_running_app()
        current = app.resource_tracker.get(res_id, 0)
        if current > 0:
            app.resource_tracker[res_id] = current - 1
            app.save_tracker()
            label_widget.text = f"{app.resource_tracker[res_id]}/{required}"

    def _clear_count(self, res_id, required, label_widget):
        app = MDApp.get_running_app()
        app.resource_tracker[res_id] = 0
        app.save_tracker()
        label_widget.text = f"0/{required}"

    def _prompt_set(self, res_id, required, label_widget):
        app = MDApp.get_running_app()
        current = app.resource_tracker.get(res_id, 0)

        field = MDTextField(
            text=str(current),
            input_filter="int",
            mode="rectangle",
            size_hint_y=None,
            height=dp(48),
            size_hint_x=1,
        )

        def on_save(*_args):
            try:
                val = int(field.text)
                if val < 0:
                    val = 0
            except Exception:
                val = current
            app.resource_tracker[res_id] = val
            app.save_tracker()
            label_widget.text = f"{val}/{required}"
            dialog.dismiss()

        def on_cancel(*_args):
            dialog.dismiss()

        content_box = MDBoxLayout(
            orientation="vertical",
            padding=[dp(12), 0, dp(12), 0],
            spacing=dp(8),
            size_hint_y=None,
            height=dp(56),
        )
        content_box.add_widget(field)

        dialog = MDDialog(
            title="Set Collected",
            type="custom",
            content_cls=content_box,
            buttons=[
                MDRaisedButton(text="Cancel", on_release=on_cancel),
                MDRaisedButton(text="Save", on_release=on_save),
            ],
        )
        dialog.open()


class AboutScreen(MDScreen):
    title = StringProperty("About")


KV = """
<BuildQueueScreen>:
    MDBoxLayout:
        orientation: "vertical"
        MDTopAppBar:
            title: app.app_config.app_name
            elevation: 2
            right_action_items: [["plus", lambda x: app.switch_screen("blueprints")], ["clipboard-list", lambda x: app.switch_screen("resources")], ["information", lambda x: app.switch_screen("about")]]
        MDScrollView:
            MDList:
                id: queue_list

<BlueprintsScreen>:
    MDBoxLayout:
        orientation: "vertical"
        MDTopAppBar:
            title: root.title
            elevation: 2
            left_action_items: [["arrow-left", lambda x: app.switch_screen("queue")]]
        MDScrollView:
            MDList:
                id: blueprint_list

<BlueprintDetailScreen>:
    MDBoxLayout:
        orientation: "vertical"
        MDTopAppBar:
            title: root.title
            elevation: 2
            left_action_items: [["arrow-left", lambda x: app.switch_screen("queue")]]
            right_action_items: [["delete", lambda x: app.remove_from_build_queue(root.blueprint_id)]]
        MDScrollView:
            MDList:
                id: detail_list

<ResourcesScreen>:
    MDBoxLayout:
        orientation: "vertical"
        MDTopAppBar:
            title: root.title
            elevation: 2
            left_action_items: [["arrow-left", lambda x: app.switch_screen("queue")]]
            right_action_items: [["refresh", lambda x: root.refresh()]]
        MDScrollView:
            MDList:
                id: resources_list

<AboutScreen>:
    MDBoxLayout:
        orientation: "vertical"
        MDTopAppBar:
            title: root.title
            elevation: 2
            left_action_items: [["arrow-left", lambda x: app.switch_screen("queue")]]
        MDScrollView:
            MDBoxLayout:
                orientation: "vertical"
                padding: dp(16)
                spacing: dp(12)
                size_hint_y: None
                height: self.minimum_height
                MDLabel:
                    text: "Companion App for Young Suns (UNOFFICIAL)"
                    theme_text_color: "Primary"
                    font_style: "H5"
                    size_hint_y: None
                    height: self.texture_size[1]
                MDLabel:
                    text: "Whist this companion app was created and developed by Oakshift Software, the underlying game (and its content) are the intellectual property of the wonderful developers at KO_OP. This app is not officially affiliated with or endorsed by them."
                    theme_text_color: "Secondary"
                    font_style: "Body2"
                    size_hint_y: None
                    height: self.texture_size[1]
                MDLabel:
                    text: "Any and all; trademarks, game content and direct game references belong to their respective owners. This application should be considrered fan-made and is provided as-is without warranty of any kind."
                    theme_text_color: "Secondary"
                    font_style: "Body2"
                    size_hint_y: None
                    height: self.texture_size[1]
"""


class YSCApp(MDApp):
    app_config = Config()
    resources = DictProperty({})
    blueprints = DictProperty({})
    build_queue = ListProperty([])
    resource_tracker = DictProperty({})

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.data_service = DataService(self)
        self.sm = MDScreenManager()
        self.detail_screen = None

    def build(self):
        Builder.load_string(KV)
        
        self.theme_cls.theme_style = "Dark"
        self.theme_cls.primary_palette = "DeepPurple"
        self.theme_cls.primary_hue = "900"
        self.theme_cls.accent_palette = "Amber"
        self.theme_cls.accent_hue = "400"
        
        # Screens
        self.sm.add_widget(BuildQueueScreen(name="queue"))
        self.sm.add_widget(BlueprintsScreen(name="blueprints"))
        self.detail_screen = BlueprintDetailScreen(name="detail")
        self.sm.add_widget(self.detail_screen)
        self.sm.add_widget(ResourcesScreen(name="resources"))
        self.sm.add_widget(AboutScreen(name="about"))

        self.load_data_cached()
        threading.Thread(target=self.load_data_remote, daemon=True).start()
        return self.sm

    def load_data_cached(self):
        bp = self.data_service.get_cached("blueprints")
        rs = self.data_service.get_cached("resources")
        queue = self.data_service.get_cached("queue")
        tracker = self.data_service.get_cached("tracker")

        if bp:
            self.blueprints = bp
        if rs:
            self.resources = rs
        if queue and isinstance(queue.get("items"), list):
            self.build_queue = queue["items"]
        if tracker and isinstance(tracker.get("collected"), dict):
            self.resource_tracker = tracker["collected"]

    def load_data_remote(self):
        """Fetch data off the main thread, then apply on UI thread.

        Updating Kivy properties from a background thread can crash on Android,
        so we schedule updates via Clock on the main thread.
        """
        try:
            bp = self.data_service.fetch_and_cache("blueprints")
            rs = self.data_service.fetch_and_cache("resources")
            queue = self.data_service.fetch_and_cache("queue")
            tracker = self.data_service.fetch_and_cache("tracker")

            def _apply_updates(_dt):
                try:
                    if bp:
                        self.blueprints = bp
                    if rs:
                        self.resources = rs
                    if queue and isinstance(queue.get("items"), list):
                        self.build_queue = queue["items"]
                    if tracker and isinstance(tracker.get("collected"), dict):
                        self.resource_tracker = tracker["collected"]
                except Exception as e:
                    print(f"[YSC] Failed applying remote updates: {e}")

            Clock.schedule_once(_apply_updates)
        except Exception as e:
            print(f"[YSC] Remote load failed: {e}")

    def switch_screen(self, name):
        self.sm.current = name

    def show_blueprint_detail(self, blueprint_id):
        self.detail_screen.blueprint_id = blueprint_id
        if "detail_list" in self.detail_screen.ids:
            self.detail_screen.ids.detail_list.clear_widgets()
        self.detail_screen.title = "Loading..."
        self.detail_screen.refresh()
        self.switch_screen("detail")

    def add_to_build_queue(self, blueprint_id):
        if blueprint_id not in self.build_queue:
            self.build_queue.append(blueprint_id)
            self.save_queue()
        self.switch_screen("queue")

    def remove_from_build_queue(self, blueprint_id):
        if blueprint_id in self.build_queue:
            self.build_queue.remove(blueprint_id)
            self.save_queue()
        self.switch_screen("queue")

    def save_queue(self):
        """Persist build queue to cache"""
        self.data_service.save_json("queue", {"items": list(self.build_queue)})
    
    def save_tracker(self):
        """Persist resource tracker to cache"""
        self.data_service.save_json("tracker", {"collected": dict(self.resource_tracker)})

    def compute_totals(self):
        """Compute total resources needed, expanding intermediates recursively"""
        totals = {"resources": {}}
        
        def add_requirements(bp_id, multiplier=1):
            bp = self.blueprints.get(bp_id, {})
            for req in bp.get("required", []):
                item_id = req.get("item", "")
                qty = req.get("quantity", 0) * multiplier
                
                if item_id in self.blueprints:
                    add_requirements(item_id, qty)
                else:
                    totals["resources"][item_id] = totals["resources"].get(item_id, 0) + qty
        
        for bp_id in self.build_queue:
            add_requirements(bp_id)
        
        return totals


if __name__ == "__main__":
    YSCApp().run()
